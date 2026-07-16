import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateShapes, shapeToString, analyzeShape, qualityToIntervals, STANDARD_TUNING } from '../src/lib/chordshapes.js';
import { noteToPitch } from '../src/lib/chords.js';

const N = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const notesOf = (frets) => [...new Set(frets.map((f, i) => (f < 0 ? null : N[(STANDARD_TUNING[i] + f) % 12])).filter(Boolean))];
const top = (c) => generateShapes(c, { maxResults: 5 }).map((s) => shapeToString(s.frets));

test('標準開放和弦排第一', () => {
  const KNOWN = [['C','x32010'],['G','320003'],['D','xx0232'],['A','x02220'],['E','022100'],
    ['Am','x02210'],['Em','022000'],['Dm','xx0231'],['G7','320001'],['C7','x32310'],
    ['Cmaj7','x32000'],['Fmaj7','xx3210'],['Am7','x02010'],['Em7','020000'],['Dm7','xx0211']];
  for (const [c, exp] of KNOWN) assert.equal(top(c)[0], exp, `${c} 應為 ${exp}`);
});

test('CAGED 移動型：大橫按和弦排第一', () => {
  const KNOWN = [['F','133211'],['Fm','133111'],['Bm','x24432'],['Bb','x13331'],
    ['F#m','244222'],['C#m','x46654'],['A#m','x13321']];
  for (const [c, exp] of KNOWN) assert.equal(top(c)[0], exp, `${c} 應為 ${exp}`);
});

test('F 被判定為大橫按（六個位置，非橫按按不完）', () => {
  const s = generateShapes('F', { maxResults: 1 })[0];
  assert.equal(shapeToString(s.frets), '133211');
  assert.deepEqual(s.barre, { fret: 1, from: 0, to: 5 });
  assert.equal(s.fingers, 4);
});

test('★ Em / A / C 不可被誤判成橫按（四根手指以內就按得完）', () => {
  for (const [c, exp] of [['Em', '022000'], ['A', 'x02220'], ['C', 'x32010'], ['Am', 'x02210']]) {
    const s = generateShapes(c, { maxResults: 1 })[0];
    assert.equal(shapeToString(s.frets), exp);
    assert.equal(s.barre, null, `${c} 不該是橫按`);
  }
});

test('★ 有開放弦時 baseFret 必須是 1（圖上要畫得出上弦枕）', () => {
  for (const c of ['D', 'Em', 'C', 'G', 'Dm7']) {
    const s = generateShapes(c, { maxResults: 1 })[0];
    assert.equal(s.baseFret, 1, `${c} 有開放弦，baseFret 應為 1`);
  }
  // 無開放弦的高把位和弦才顯示 "Nfr"
  assert.equal(generateShapes('Bm', { maxResults: 1 })[0].baseFret, 2);
  assert.equal(generateShapes('C#m', { maxResults: 1 })[0].baseFret, 4);
});

test('分割和弦的最低音必須是指定的 bass', () => {
  for (const [c, bass] of [['Am/G','G'],['C/E','E'],['D/F#','F#'],['A#m/G#','G#']]) {
    const s = generateShapes(c, { maxResults: 1 })[0];
    assert.ok(s, `${c} 應該要有指型`);
    const firstIdx = s.frets.findIndex((f) => f >= 0);
    const lowest = N[(STANDARD_TUNING[firstIdx] + s.frets[firstIdx]) % 12];
    assert.equal(noteToPitch(lowest), noteToPitch(bass), `${c} 最低音應為 ${bass}，實際 ${lowest}`);
  }
});

test('★ 分割和弦不可弄丟根音', () => {
  const s = generateShapes('A#m/G#', { maxResults: 1 })[0];
  const notes = notesOf(s.frets);
  assert.ok(notes.includes('A#'), `A#m/G# 必須含根音 A#，實際只有 ${notes.join(' ')}`);
  assert.ok(notes.includes('C#'), '必須含小三度 C#');
  assert.ok(notes.includes('G#'), '必須含低音 G#');
});

test('★ 延伸和弦不可弄丟特徵音（9度）', () => {
  const notes = notesOf(generateShapes('Bbm9', { maxResults: 1 })[0].frets);
  for (const n of ['A#', 'C#', 'G#', 'C']) assert.ok(notes.includes(n), `Bbm9 缺 ${n}，實際 ${notes.join(' ')}`);
});

test('演算法接得住查表沒有的罕見和弦', () => {
  const CASES = [['Cdim',['C','D#','F#']], ['Ddim7',['D','F','G#','B']],
    ['A#m7b5',['A#','C#','E','G#']], ['F#aug',['F#','A#','D']], ['G7sus4',['G','C','D','F']]];
  for (const [c, expect] of CASES) {
    const s = generateShapes(c, { maxResults: 1 })[0];
    assert.ok(s, `${c} 應該要有指型`);
    const notes = notesOf(s.frets);
    for (const n of expect) assert.ok(notes.includes(n), `${c} 缺 ${n}，實際 ${notes.join(' ')}`);
    for (const n of notes) assert.ok(expect.includes(n), `${c} 多出不該有的 ${n}`);
  }
});

test('所有產出的指型都可彈（跨度 ≤4、手指 ≤4）', () => {
  for (const c of ['C','F','Bm','G7sus4','A#m7b5','Cmaj7','Am/G','Ddim7','Bbm9','F#aug']) {
    for (const s of generateShapes(c, { maxResults: 4 })) {
      assert.ok(s.span <= 4, `${c} ${shapeToString(s.frets)} 跨度 ${s.span} 太大`);
      assert.ok(s.fingers <= 4, `${c} ${shapeToString(s.frets)} 需要 ${s.fingers} 根手指`);
    }
  }
});

test('不認得的和弦回空陣列，不丟例外', () => {
  for (const junk of ['N.C.', '%', '|', 'Hello', '', 'Xyz9']) {
    assert.deepEqual(generateShapes(junk), [], `${junk} 應回空陣列`);
  }
});

test('轉調後的和弦都找得到指型（12 調全掃）', async () => {
  const song = ['C','Am','F','G','Em','Dm7','G7','Cmaj7'];
  const { transposeChord } = await import('../src/lib/chords.js');
  let miss = 0;
  for (let semi = 0; semi < 12; semi++) {
    for (const c of song) {
      const t = transposeChord(c, semi);
      if (generateShapes(t, { maxResults: 1 }).length === 0) { miss++; console.log('缺:', t); }
    }
  }
  assert.equal(miss, 0, `${miss} 個轉調後的和弦找不到指型`);
});

test('quality 解析：m 不會誤吃 maj7', () => {
  assert.deepEqual(qualityToIntervals('maj7').intervals, [0, 4, 7, 11]);
  assert.deepEqual(qualityToIntervals('m').intervals, [0, 3, 7]);
  assert.deepEqual(qualityToIntervals('m7b5').intervals, [0, 3, 6, 10]);
  assert.equal(qualityToIntervals('zzz'), null);
});

test('analyzeShape：Em 不橫按、baseFret 為 1', () => {
  const s = analyzeShape([0, 2, 2, 0, 0, 0]);
  assert.equal(s.barre, null);
  assert.equal(s.baseFret, 1);
  assert.equal(s.fingers, 2);
});
