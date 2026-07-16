import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transposeChord, parseChord, detectKey } from '../src/lib/chords.js';
import { parseChordPro, parseChordLine, collectChords, pairsToUnits } from '../src/lib/chordpro.js';

test('基本三和弦升降', () => {
  assert.equal(transposeChord('C', 1), 'C#');
  assert.equal(transposeChord('C', 1, true), 'Db');
  assert.equal(transposeChord('B', 1), 'C');       // 跨八度
  assert.equal(transposeChord('C', -1, true), 'B');
});

test('保留和弦屬性', () => {
  assert.equal(transposeChord('Cmaj7', 1), 'C#maj7');
  assert.equal(transposeChord('G7sus4', 2), 'A7sus4');
  assert.equal(transposeChord('F#m7b5', -1), 'Fm7b5');
  assert.equal(transposeChord('Adim', 3), 'Cdim');
});

test('分割和弦 slash chord', () => {
  assert.equal(transposeChord('Am/G', 1), 'A#m/G#');
  assert.equal(transposeChord('Am/G', 1, true), 'Bbm/Ab');
  assert.equal(transposeChord('C/E', 5), 'F/A');
});

test('非和弦標記原樣保留', () => {
  assert.equal(transposeChord('N.C.', 3), 'N.C.');
  assert.equal(transposeChord('%', 3), '%');
  assert.equal(parseChord('Hello'), null);
});

test('重升重降可解析', () => {
  assert.equal(transposeChord('Bbb', 1), 'A#'); // Bbb=A(9) → +1 = A#
});

test('轉一圈回到原點', () => {
  assert.equal(transposeChord('Dm7', 12), 'Dm7');
});

test('調性判斷', () => {
  assert.deepEqual(detectKey(['Am', 'F', 'C', 'G']).label, 'Am');
  assert.deepEqual(detectKey(['Cmaj7', 'F']).label, 'C');   // maj7 不算小調
});

test('ChordPro 拆行', () => {
  const pairs = parseChordLine('[C]Twinkle, twinkle, [F]little [C]star');
  assert.deepEqual(pairs, [
    { chord: 'C', text: 'Twinkle, twinkle, ' },
    { chord: 'F', text: 'little ' },
    { chord: 'C', text: 'star' },
  ]);
});

test('行首無和弦', () => {
  assert.deepEqual(parseChordLine('How I [C]wonder')[0], { chord: null, text: 'How I ' });
});

test('指令與段落', () => {
  const ast = parseChordPro('{title: Test}\n{artist: X}\n\n{soc}\n[C]hi\n{eoc}\n\n{sot}\ne|--0--|\n{eot}');
  assert.equal(ast.meta.title, 'Test');
  assert.equal(ast.meta.artist, 'X');
  assert.deepEqual(ast.blocks.map((b) => b.type), ['chorus', 'tab']);
  assert.deepEqual(collectChords(ast), ['C']);
});

test('CJK 逐字切成斷行單元', () => {
  const units = pairsToUnits(parseChordLine('[C]我曾經跨過'));
  assert.equal(units.length, 5);
  assert.equal(units[0].chord, 'C');
  assert.equal(units[0].text, '我');
  assert.equal(units[4].text, '過');
});

test('中文標點不會跑到行首', () => {
  const units = pairsToUnits(parseChordLine('[C]大海，[Am]人海'));
  assert.deepEqual(units.map((u) => u.text), ['大', '海，', '人', '海']);
});

test('拉丁單字不會被拆開', () => {
  const units = pairsToUnits(parseChordLine('[C]Twinkle, twinkle'));
  assert.deepEqual(units.map((u) => u.text), ['Twinkle,', ' ', 'twinkle']);
  assert.equal(units[0].chord, 'C');
});

test('中英混排', () => {
  const units = pairsToUnits(parseChordLine('[C]我 love 你'));
  assert.deepEqual(units.map((u) => u.text), ['我', ' ', 'love', ' ', '你']);
});
