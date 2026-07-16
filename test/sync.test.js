import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSongs, sameSongs, toBase64, fromBase64 } from '../src/lib/sync.js';

const song = (id, updatedAt, extra = {}) => ({ id, title: id, source: '', updatedAt, ...extra });

test('遠端沒有的歌會被帶上去', () => {
  const m = mergeSongs([song('a', '2026-01-02')], []);
  assert.equal(m.length, 1);
  assert.equal(m[0].id, 'a');
});

test('本機沒有的歌會被拉下來', () => {
  const m = mergeSongs([], [song('b', '2026-01-02')]);
  assert.equal(m[0].id, 'b');
});

test('同一首取較新的版本', () => {
  const m = mergeSongs(
    [song('a', '2026-01-05', { title: '新' })],
    [song('a', '2026-01-01', { title: '舊' })]
  );
  assert.equal(m.length, 1);
  assert.equal(m[0].title, '新');
});

test('遠端較新時本機會被更新', () => {
  const m = mergeSongs(
    [song('a', '2026-01-01', { title: '舊' })],
    [song('a', '2026-01-09', { title: '新' })]
  );
  assert.equal(m[0].title, '新');
});

test('兩台各改不同的歌，都要留下（不是整包覆蓋）', () => {
  const m = mergeSongs(
    [song('a', '2026-01-05'), song('b', '2026-01-01')],
    [song('a', '2026-01-01'), song('c', '2026-01-06')]
  );
  assert.deepEqual(m.map((s) => s.id).sort(), ['a', 'b', 'c']);
});

test('刪除墓碑會贏過較舊的編輯（歌不會復活）', () => {
  const m = mergeSongs(
    [song('a', '2026-01-09', { deletedAt: '2026-01-09' })],
    [song('a', '2026-01-03')]
  );
  assert.equal(m.length, 1);
  assert.ok(m[0].deletedAt, '應保留墓碑而不是復活');
});

test('刪除後又在另一台編輯，編輯較新則復活（符合直覺）', () => {
  const m = mergeSongs(
    [song('a', '2026-01-01', { deletedAt: '2026-01-01' })],
    [song('a', '2026-01-08', { title: '改過' })]
  );
  assert.equal(m[0].deletedAt, undefined);
  assert.equal(m[0].title, '改過');
});

test('內容相同就不該觸發 push', () => {
  const a = [song('x', '2026-01-01'), song('y', '2026-01-02')];
  const b = [song('y', '2026-01-02'), song('x', '2026-01-01')]; // 順序不同
  assert.equal(sameSongs(a, b), true);
});

test('內容不同要觸發 push', () => {
  assert.equal(sameSongs([song('x', '2026-01-01')], [song('x', '2026-01-02')]), false);
});

test('Base64 來回不會弄壞中文與 emoji', () => {
  const s = JSON.stringify({ t: '月亮代表我的心 [Am7] ♭♯ 🎸' });
  assert.equal(fromBase64(toBase64(s)), s);
});

test('Base64 可處理大檔（不爆 call stack）', () => {
  const big = '和弦'.repeat(80000);
  assert.equal(fromBase64(toBase64(big)), big);
});
