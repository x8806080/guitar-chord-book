import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transposeChord, parseChord, detectKey, normalizeChordName } from '../src/lib/chords.js';
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
  assert.deepEqual(pairs.map((p) => [p.chord, p.text]), [
    ['C', 'Twinkle, twinkle, '],
    ['F', 'little '],
    ['C', 'star'],
  ]);
});

test('★ 拆行時要記錄每個和弦在原始碼的座標（直接編輯樂譜靠這個）', () => {
  const line = '[C]Twinkle, [F]little';
  const pairs = parseChordLine(line, 0);
  for (const p of pairs.filter((x) => x.chord)) {
    assert.equal(line.slice(p.chordStart, p.chordEnd), `[${p.chord}]`, '座標必須切得出原本的標記');
  }
  // 帶 offset：模擬這行不是第一行
  const off = parseChordLine(line, 100);
  assert.equal(off.find((p) => p.chord).chordStart, 100);
});

test('行首無和弦', () => {
  const p = parseChordLine('How I [C]wonder')[0];
  assert.equal(p.chord, null);
  assert.equal(p.text, 'How I ');
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

test('★★ 括號延伸音正規化（e-chords 等外部譜常見寫法）', () => {
  const cases = [
    ['Em7(9)', 'Em9'], ['A5(7/9)', 'A9'], ['C(add9)', 'Cadd9'],
    ['G7(b9)', 'G7b9'], ['D(9)', 'Dadd9'], ['A5(9)', 'Aadd9'],
    ['G7(9/13)', 'G13'], ['A7(b9)', 'A7b9'], ['Cmaj7(9)', 'Cmaj9'],
    ['Dm7(11)', 'Dm11'],
    // 不含括號的一般和弦不可被動到
    ['Cmaj7', 'Cmaj7'], ['Am/G', 'Am/G'], ['A7', 'A7'], ['C/G', 'C/G'], ['Em', 'Em'],
  ];
  for (const [inp, exp] of cases) {
    assert.equal(normalizeChordName(inp), exp, `${inp} 應正規化為 ${exp}`);
  }
});

test('★★ 括號寫法要能解析出根音與 quality', () => {
  assert.deepEqual(parseChord('Em7(9)'), { root: 'E', quality: 'm9', bass: null });
  assert.deepEqual(parseChord('A5(7/9)'), { root: 'A', quality: '9', bass: null });
  assert.deepEqual(parseChord('G7(b9)'), { root: 'G', quality: '7b9', bass: null });
  // 原本完全解析失敗的 A5(7/9) 現在必須成功
  assert.ok(parseChord('A5(7/9)'), 'A5(7/9) 不可再回 null');
});

test('★★ 括號和弦轉調要保留使用者原本的寫法（跟原譜對得上）', () => {
  assert.equal(transposeChord('Em7(9)', 2), 'F#m7(9)');
  assert.equal(transposeChord('A5(7/9)', 2), 'B5(7/9)');
  assert.equal(transposeChord('Em7(9)', 0), 'Em7(9)', '不轉調時原樣');
  // 一般和弦轉調不受影響
  assert.equal(transposeChord('Cmaj7', 2), 'Dmaj7');
  assert.equal(transposeChord('Am/G', 2), 'Bm/A');
});
