import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const db = await import('../src/lib/storage.js');
const { SYNC_DEFAULTS } = await import('../src/config.js');

const reset = () => store.clear();

test('全新裝置：owner/repo/path/branch 自動帶入，只有 token 是空的', () => {
  reset();
  const c = db.getSyncConfig();
  assert.equal(c.owner, SYNC_DEFAULTS.owner);
  assert.equal(c.repo, SYNC_DEFAULTS.repo);
  assert.equal(c.path, SYNC_DEFAULTS.path);
  assert.equal(c.branch, SYNC_DEFAULTS.branch);
  assert.equal(c.token, '', 'token 必須留空，不可有預設值');
});

test('只差 token 時 isSyncReady 為 false', () => {
  reset();
  assert.equal(db.isSyncReady(db.getSyncConfig()), false);
});

test('貼上 token 後 isSyncReady 為 true', () => {
  reset();
  db.setSyncConfig({ ...db.getSyncConfig(), token: 'github_pat_abc123' });
  assert.equal(db.isSyncReady(db.getSyncConfig()), true);
});

test('舊版存過的空 owner/repo 會被預設值救回來', () => {
  reset();
  // 模擬更新前存下的設定：owner/repo 是空字串
  store.set('gcb.sync.v1', JSON.stringify({ token: 'github_pat_abc', owner: '', repo: '', path: '', branch: '' }));
  const c = db.getSyncConfig();
  assert.equal(c.owner, SYNC_DEFAULTS.owner);
  assert.equal(c.repo, SYNC_DEFAULTS.repo);
  assert.equal(c.path, SYNC_DEFAULTS.path);
  assert.equal(c.branch, SYNC_DEFAULTS.branch);
  assert.equal(db.isSyncReady(c), true, '舊設定也應該直接可用');
});

test('使用者自訂的 owner/repo 不會被預設值蓋掉', () => {
  reset();
  db.setSyncConfig({ ...db.getSyncConfig(), token: 't', owner: 'someone-else', repo: 'my-repo' });
  const c = db.getSyncConfig();
  assert.equal(c.owner, 'someone-else');
  assert.equal(c.repo, 'my-repo');
});

test('移除 token 後會回到未設定狀態', () => {
  reset();
  db.setSyncConfig({ ...db.getSyncConfig(), token: 'github_pat_abc' });
  db.clearSyncConfig();
  assert.equal(db.getSyncConfig().token, '');
  assert.equal(db.isSyncReady(db.getSyncConfig()), false);
});

test('config.js 不可以夾帶 token（防手滑）', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/config.js', import.meta.url), 'utf-8');
  assert.equal(/github_pat_[A-Za-z0-9_]{10,}/.test(src), false, 'config.js 出現疑似真實 token');
  assert.equal(/ghp_[A-Za-z0-9]{20,}/.test(src), false, 'config.js 出現疑似 classic token');
  assert.equal(Object.keys(SYNC_DEFAULTS).includes('token'), false, 'SYNC_DEFAULTS 不可以有 token 欄位');
});
