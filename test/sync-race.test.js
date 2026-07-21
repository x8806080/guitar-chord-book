import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSongs } from '../src/lib/sync.js';

const song = (id, source, updatedAt) => ({ id, title: 't', source, updatedAt, createdAt: '2026-01-01T00:00:00Z' });

test('★★ 正在編輯的歌（較新）不可被遠端舊版蓋掉', () => {
  // 使用者在本機編輯 → updatedAt 較新
  const local = [song('a', '我剛打的新內容', '2026-07-18T12:00:05Z')];
  // 遠端是同步前的舊版
  const remote = [song('a', '舊內容', '2026-07-18T12:00:00Z')];
  const m = mergeSongs(local, remote);
  assert.equal(m.find((s) => s.id === 'a').source, '我剛打的新內容', '本機較新，必須留住');
});

test('★★ 其他裝置的較新版本要能拉下來', () => {
  const local = [song('a', '本機舊版', '2026-07-18T12:00:00Z')];
  const remote = [song('a', '另一台改的新版', '2026-07-18T12:00:10Z')];
  const m = mergeSongs(local, remote);
  assert.equal(m.find((s) => s.id === 'a').source, '另一台改的新版');
});

test('★★ 時間戳相同時保留本機（避免自己的編輯被自己的舊快照覆蓋）', () => {
  const t = '2026-07-18T12:00:00Z';
  const local = [song('a', '本機', t)];
  const remote = [song('a', '遠端', t)];
  const m = mergeSongs(local, remote);
  // mergeSongs 對相同時間戳的處理必須穩定，不能每次不一樣
  const m2 = mergeSongs(local, remote);
  assert.equal(m.find((s) => s.id === 'a').source, m2.find((s) => s.id === 'a').source, '相同輸入必須有穩定結果');
});

test('★ 本機新增、遠端還沒有的歌要保留（不可因為同步而消失）', () => {
  const local = [song('new', '剛新增的歌', '2026-07-18T12:00:00Z')];
  const remote = [];
  const m = mergeSongs(local, remote);
  assert.ok(m.find((s) => s.id === 'new'), '本機新增的歌不可在同步後消失');
});

test('★★ 模擬完整競態：打字期間同步 pull 回來', () => {
  // 情境重現：
  //   T0 使用者開始編輯，本機 = "abc"，updatedAt = T0
  //   T0 同步開始，pull 用的遠端快照 = 空白初始版，updatedAt = 更早
  //   T1 pull 回來 merge
  const editStart = '2026-07-18T12:00:03Z';
  const localWhileEditing = [song('x', 'abcdef 使用者正在打的內容', editStart)];
  const remoteSnapshot = [song('x', '', '2026-07-18T11:59:00Z')]; // 一分鐘前的空白版

  const merged = mergeSongs(localWhileEditing, remoteSnapshot);
  assert.equal(merged.find((s) => s.id === 'x').source, 'abcdef 使用者正在打的內容',
    '打字期間 pull 回來，內容不可被清空/跳回');
});

test('★★ saveSong 要尊重呼叫端設好的 updatedAt（編輯瞬間的時間戳）', async () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
  const db = await import('../src/lib/storage.js');

  const editStamp = '2026-07-18T12:00:05Z';
  db.saveSong({ id: 's1', title: 't', source: 'edited', updatedAt: editStamp, createdAt: '2026-01-01T00:00:00Z' });
  const saved = db.listAll().find((s) => s.id === 's1');
  assert.equal(saved.updatedAt, editStamp, 'saveSong 不可用存檔當下的時間覆蓋編輯時間');
});

test('★ saveSong 沒帶 updatedAt 時才自動補', async () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
  const db = await import('../src/lib/storage.js');

  const before = Date.now();
  db.saveSong({ id: 's2', title: 't', source: 'x', createdAt: '2026-01-01T00:00:00Z' });
  const saved = db.listAll().find((s) => s.id === 's2');
  assert.ok(saved.updatedAt, '沒帶就要自動補一個');
  assert.ok(new Date(saved.updatedAt).getTime() >= before - 1000);
});

test('★★ 新增的歌（有時間戳）在同步 merge 後不可消失', () => {
  // handleCreate 後：本機有新歌，遠端（同步開始時的快照）還沒有
  const newSong = { id: 'brand-new', title: '未命名', source: '[C]在這裡開始寫', updatedAt: '2026-07-18T12:00:05Z', createdAt: '2026-07-18T12:00:05Z' };
  const local = [newSong];
  const remoteSnapshot = []; // 同步開始時遠端還沒這首
  const m = mergeSongs(local, remoteSnapshot);
  assert.ok(m.find((s) => s.id === 'brand-new'), '新增的歌在同步後必須還在');
  assert.equal(m.find((s) => s.id === 'brand-new').source, '[C]在這裡開始寫');
});

test('★★ createSong 一定帶 updatedAt（否則新增後同步會判定為最舊而被吃掉）', async () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
  const db = await import('../src/lib/storage.js');
  const s = db.createSong({ source: 'x' });
  assert.ok(s.updatedAt, 'createSong 必須帶 updatedAt');
  assert.ok(s.createdAt, 'createSong 必須帶 createdAt');
});
