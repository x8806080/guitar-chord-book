import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
};

const C = await import('../src/lib/customshapes.js');
const { generateShapes } = await import('../src/lib/chordshapes.js');
const reset = () => Object.keys(store).forEach((k) => delete store[k]);

test('★★ 存自訂指型後，引擎優先用它', () => {
  reset();
  const algo = generateShapes('C', { maxResults: 1 })[0];
  assert.equal(algo.source, 'open', '一開始是演算法版');

  C.saveCustomShape('C', { frets: [-1, 3, 2, 0, 1, 3], baseFret: 1, barre: null });
  const now = generateShapes('C', { maxResults: 1 })[0];
  assert.equal(now.source, 'custom');
  assert.deepEqual(now.frets, [-1, 3, 2, 0, 1, 3]);
});

test('★★ 刪除自訂後回到演算法版', () => {
  reset();
  C.saveCustomShape('C', { frets: [-1, 3, 2, 0, 1, 3], baseFret: 1, barre: null });
  C.deleteCustomShape('C');
  assert.equal(generateShapes('C', { maxResults: 1 })[0].source, 'open');
});

test('★★ 同音異名共用同一個自訂指型（改 C#m，Dbm 也生效）', () => {
  reset();
  assert.equal(C.chordKey('C#m'), C.chordKey('Dbm'));
  C.saveCustomShape('C#m', { frets: [-1, 4, 6, 6, 5, 4], baseFret: 4, barre: null });
  const dbm = generateShapes('Dbm', { maxResults: 1 })[0];
  assert.equal(dbm.source, 'custom', 'Dbm 應該吃到 C#m 存的自訂');
});

test('★ 自訂指型會保留橫按資訊', () => {
  reset();
  C.saveCustomShape('F', { frets: [1, 3, 3, 2, 1, 1], baseFret: 1, barre: { fret: 1, from: 0, to: 5 } });
  const s = generateShapes('F', { maxResults: 1 })[0];
  assert.deepEqual(s.barre, { fret: 1, from: 0, to: 5 });
});

test('★ 非法品位會被夾到合理範圍，不會存進髒資料', () => {
  reset();
  C.saveCustomShape('C', { frets: [99, -5, 2, 0, 1, 0], baseFret: 1, barre: null });
  const s = generateShapes('C', { maxResults: 1 })[0];
  assert.ok(s.frets.every((f) => f >= -1 && f <= 24), `品位越界：${s.frets}`);
});

test('★ includeCustom:false 時忽略自訂（編輯器要看演算法原版）', () => {
  reset();
  C.saveCustomShape('C', { frets: [-1, 3, 2, 0, 1, 3], baseFret: 1, barre: null });
  const algo = generateShapes('C', { maxResults: 1, includeCustom: false })[0];
  assert.equal(algo.source, 'open');
});

test('★★ 合併：同 key 取較新', () => {
  const local = { 'k1': { updatedAt: '2026-07-18T10:00:00Z', shape: { frets: [1] } } };
  const remote = { 'k1': { updatedAt: '2026-07-18T09:00:00Z', shape: { frets: [2] } }, 'k2': { updatedAt: '2026-07-18T08:00:00Z', shape: {} } };
  const m = C.mergeCustom(local, remote);
  assert.deepEqual(m.k1.shape.frets, [1], '本機較新，取本機');
  assert.ok(m.k2, '遠端獨有的要保留');
});

test('★ 合併空的不會爆', () => {
  assert.deepEqual(C.mergeCustom({}, {}), {});
  assert.deepEqual(C.mergeCustom(undefined, undefined), {});
});

test('不認得的和弦回 null key', () => {
  assert.equal(C.chordKey('N.C.'), null);
  assert.equal(C.chordKey(''), null);
  assert.equal(C.saveCustomShape('亂寫', {}), false);
});

test('★★ 自訂指型不可被 analyzeShape 的合法性檢查擋掉（存了看不到的根因）', () => {
  reset();
  // 這些指型 analyzeShape 會回 null（音太少、跨度大），但使用者存了就該看得到
  const cases = [
    ['C', [-1, -1, -1, -1, 2, 3]],   // 只壓 2 條弦
    ['D', [-1, -1, -1, -1, -1, 3]],  // 只壓 1 條弦
    ['E', [1, -1, -1, -1, -1, 7]],   // 跨度 7 品
  ];
  for (const [name, frets] of cases) {
    C.saveCustomShape(name, { frets, baseFret: 1, barre: null });
    const s = generateShapes(name, { maxResults: 1 })[0];
    assert.equal(s?.source, 'custom', `${name} 自訂指型必須顯示得出來`);
    assert.deepEqual(s.frets, frets, `${name} 必須用存的 frets`);
  }
});

test('★★ 自訂指型要保留使用者存的 baseFret 與 barre，不可被重算', () => {
  reset();
  // 高把位橫按：使用者在編輯器設 baseFret=5、特定 barre
  C.saveCustomShape('Bm', { frets: [5, 7, 7, 5, 5, 5], baseFret: 5, barre: { fret: 5, from: 0, to: 5 } });
  const s = generateShapes('Bm', { maxResults: 1 })[0];
  assert.equal(s.baseFret, 5, 'baseFret 必須用存的，不可被 analyzeShape 重算');
  assert.deepEqual(s.barre, { fret: 5, from: 0, to: 5 }, 'barre 必須用存的');
});
