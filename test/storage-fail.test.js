import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * 儲存失敗不可以靜默 —— 這守的是一個真實症狀：
 * 新增/編輯看起來成功（畫面有東西），但 localStorage 根本沒寫進去，
 * 使用者要等到重新整理才發現資料不見了。
 */

const makeLS = ({ failWrite = false, quota = false } = {}) => {
  const store = {};
  return {
    store,
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => {
      if (failWrite) {
        const e = new Error(quota ? 'QuotaExceededError: exceeded the quota' : 'SecurityError');
        e.name = quota ? 'QuotaExceededError' : 'SecurityError';
        throw e;
      }
      store[k] = v;
    },
    removeItem: (k) => { delete store[k]; },
  };
};

test('★★ 儲存失敗必須拋錯，不可靜默吞掉', async () => {
  globalThis.localStorage = makeLS({ failWrite: true });
  const db = await import('../src/lib/storage.js?fail1');
  assert.throws(
    () => db.saveSong(db.createSong({ title: 'x', source: 'y' })),
    (e) => e.name === 'StorageError',
    '寫入失敗時 saveSong 必須拋 StorageError'
  );
});

test('★ 容量滿的錯誤訊息要能指引使用者處理', async () => {
  globalThis.localStorage = makeLS({ failWrite: true, quota: true });
  const db = await import('../src/lib/storage.js?fail2');
  try {
    db.saveSong(db.createSong({ title: 'x', source: 'y' }));
    assert.fail('應該要拋錯');
  } catch (e) {
    assert.match(e.message, /空間|滿|備份/, `訊息要能指引使用者：${e.message}`);
  }
});

test('★★ checkStorageWorks 能偵測出不可用的儲存', async () => {
  globalThis.localStorage = makeLS({ failWrite: true });
  const db = await import('../src/lib/storage.js?probe1');
  assert.equal(db.checkStorageWorks(), false);
});

test('★ 正常環境 checkStorageWorks 回 true，且不留下垃圾', async () => {
  const ls = makeLS();
  globalThis.localStorage = ls;
  const db = await import('../src/lib/storage.js?probe2');
  assert.equal(db.checkStorageWorks(), true);
  assert.deepEqual(Object.keys(ls.store), [], '探測用的 key 必須清掉');
});

test('★ 正常環境存檔仍然正常', async () => {
  globalThis.localStorage = makeLS();
  const db = await import('../src/lib/storage.js?ok1');
  const s = db.createSong({ title: '歌', source: 'abc' });
  db.saveSong(s);
  assert.equal(db.listAll().find((x) => x.id === s.id)?.source, 'abc');
});

test('★★ 容量滿時先清墓碑再重試，能救就不要打擾使用者', async () => {
  let full = true;
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => {
      // 模擬：資料超過某個長度就滿；清掉墓碑變短之後就寫得進去
      if (full && v.length > 400) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      store[k] = v;
    },
    removeItem: (k) => { delete store[k]; },
  };
  const db = await import('../src/lib/storage.js?purge1');

  // 先塞一批墓碑（直接寫，繞過長度限制）
  full = false;
  const tombs = Array.from({ length: 6 }, (_, i) => ({
    id: 't' + i, title: '已刪除的歌' + i, source: '',
    deletedAt: '2026-07-18T00:00:00Z', updatedAt: '2026-07-18T00:00:00Z',
  }));
  store['gcb.songs.v1'] = JSON.stringify(tombs);
  full = true;

  const s = db.createSong({ title: '新歌', source: 'abc' });
  const result = db.saveSong(s);   // 第一次會 quota，清墓碑後應成功
  assert.ok(result.find((x) => x.id === s.id), '清完墓碑後新歌要存得進去');
  assert.equal(result.filter((x) => x.deletedAt).length, 0, '墓碑應已清掉');
});

test('★★ 沒有墓碑可清時，容量錯誤要如實拋出（不可假裝成功）', async () => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: () => { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; },
    removeItem: (k) => { delete store[k]; },
  };
  const db = await import('../src/lib/storage.js?purge2');
  assert.throws(() => db.saveSong(db.createSong({ title: 'x', source: 'y' })), (e) => e.name === 'StorageError');
});

test('★ storageUsage 能算出用量與最大的歌', async () => {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
    // Object.keys(localStorage) 需要可列舉的屬性，這裡直接掛上去
  };
  const db = await import('../src/lib/storage.js?usage1');
  db.saveSong(db.createSong({ title: '小歌', source: 'a' }));
  db.saveSong(db.createSong({ title: '大歌', source: 'x'.repeat(5000) }));
  const u = db.storageUsage();
  assert.equal(u.songCount, 2);
  assert.equal(u.largestSongs[0].title, '大歌', '最大的要排第一');
  assert.ok(u.largestSongs[0].bytes > 4000);
});
