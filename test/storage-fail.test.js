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
