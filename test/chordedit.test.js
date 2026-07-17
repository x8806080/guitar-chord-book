import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  replaceChord, removeChord, moveChord, insertChord,
  lineRangeAt, tagAt, toSourceChord, toShownChord,
} from '../src/lib/chordedit.js';
import { parseChordPro } from '../src/lib/chordpro.js';

/** 從原始碼找出第 n 個和弦的座標（模擬使用者點到的那個） */
const chordAt = (src, n = 0) => {
  const found = [];
  for (const b of parseChordPro(src).blocks) {
    for (const l of b.lines) for (const p of l.pairs ?? []) if (p.chord) found.push(p);
  }
  return found[n];
};

test('★ 座標必須切得出原本那個標記', () => {
  const src = '[C]Twinkle, [F]little [C]star';
  for (let i = 0; i < 3; i++) {
    const p = chordAt(src, i);
    assert.equal(src.slice(p.chordStart, p.chordEnd), `[${p.chord}]`);
  }
});

test('★ 換和弦只動那一個，其他完全不變', () => {
  const src = '[C]Twinkle, [F]little [C]star';
  const p = chordAt(src, 1);
  const r = replaceChord(src, p.chordStart, p.chordEnd, 'Am7');
  assert.equal(r.source, '[C]Twinkle, [Am7]little [C]star');
  assert.equal(r.source.slice(r.start, r.end), '[Am7]', '回傳的新座標要對得上');
});

test('★ 換成空字串 = 刪除', () => {
  const src = '[C]Twinkle, [F]little';
  const p = chordAt(src, 1);
  assert.equal(replaceChord(src, p.chordStart, p.chordEnd, '   ').source, '[C]Twinkle, little');
});

test('刪和弦', () => {
  const src = '[C]Twinkle, [F]little';
  const p = chordAt(src, 0);
  assert.equal(removeChord(src, p.chordStart, p.chordEnd).source, 'Twinkle, [F]little');
});

test('★ 右移一個字元', () => {
  const src = '[C]Twinkle';
  const p = chordAt(src, 0);
  const r = moveChord(src, p.chordStart, p.chordEnd, 1);
  assert.equal(r.source, 'T[C]winkle');
  assert.equal(r.moved, true);
  assert.equal(r.source.slice(r.start, r.end), '[C]');
});

test('★ 左移一個字元', () => {
  const src = 'Tw[C]inkle';
  const p = chordAt(src, 0);
  assert.equal(moveChord(src, p.chordStart, p.chordEnd, -1).source, 'T[C]winkle');
});

test('★ 中文逐字移動', () => {
  const src = '[C]我曾經跨過';
  const p = chordAt(src, 0);
  const r = moveChord(src, p.chordStart, p.chordEnd, 1);
  assert.equal(r.source, '我[C]曾經跨過');
});

test('★ 不可移出行首 / 行尾', () => {
  const head = chordAt('[C]abc', 0);
  assert.equal(moveChord('[C]abc', head.chordStart, head.chordEnd, -1).moved, false, '已在行首');

  const tail = chordAt('abc[C]', 0);
  assert.equal(moveChord('abc[C]', tail.chordStart, tail.chordEnd, 1).moved, false, '已在行尾');
});

test('★★ 不可跨行（會把和弦搬到別段歌詞去）', () => {
  const src = 'abc[C]\ndef';
  const p = chordAt(src, 0);
  const r = moveChord(src, p.chordStart, p.chordEnd, 1);
  assert.equal(r.moved, false);
  assert.equal(r.source, src, '原始碼一個字都不該變');
});

test('★★ 移動時要跳過另一個和弦，不可插進標記中間', () => {
  const src = '[C][G]word';
  const p = chordAt(src, 0);
  const r = moveChord(src, p.chordStart, p.chordEnd, 1);
  assert.equal(r.source, '[G][C]word', '應整個跳過 [G]，不可變成 [[C]G]');
  assert.ok(!r.source.includes('[[') && !r.source.includes(']]'), '不可產生巢狀標記');
});

test('★★ 連續移動不可弄丟和弦、不可產生壞掉的標記', () => {
  // 注意：和弦「順序」會變是正確的 —— 右移到底本來就該越過下一個和弦。
  // 真正的不變量是「和弦一個都沒少、原始碼仍可解析、沒有巢狀標記」。
  let src = '[C]Twinkle, [F]little [C]star';
  const readChords = (t) => {
    const out = [];
    for (const b of parseChordPro(t).blocks)
      for (const l of b.lines) for (const q of l.pairs ?? []) if (q.chord) out.push(q.chord);
    return out;
  };
  for (let i = 0; i < 20; i++) {
    const p = chordAt(src, 1);
    if (!p) break;
    src = moveChord(src, p.chordStart, p.chordEnd, 1).source;

    assert.deepEqual([...readChords(src)].sort(), ['C', 'C', 'F'], `第 ${i + 1} 次移動弄丟和弦：${src}`);
    assert.ok(!src.includes('[['), `第 ${i + 1} 次產生巢狀標記：${src}`);
    assert.ok(!src.includes(']]'), `第 ${i + 1} 次產生巢狀標記：${src}`);
    assert.equal(src.replace(/\[[^\]]*\]/g, ''), 'Twinkle, little star', `第 ${i + 1} 次動到歌詞：${src}`);
  }
});

test('★ 右移到底會停在行尾，不會無限循環', () => {
  let src = '[C]ab';
  for (let i = 0; i < 10; i++) {
    const p = chordAt(src, 0);
    const r = moveChord(src, p.chordStart, p.chordEnd, 1);
    src = r.source;
    if (!r.moved) break;
  }
  assert.equal(src, 'ab[C]', '應停在行尾');
});

test('在任意位置插入和弦', () => {
  assert.equal(insertChord('Twinkle', 0, 'C').source, '[C]Twinkle');
  assert.equal(insertChord('Twinkle', 3, 'G').source, 'Twi[G]nkle');
  assert.equal(insertChord('abc', 1).source, 'a[C]bc', '沒指定就給 C');
});

test('★★ 轉調狀態下編輯，必須反向轉調才寫回原調', () => {
  // 原調 C，移調 +2 → 畫面顯示 D。使用者把它改成 Em（畫面值）
  // 寫回原始碼必須是 Dm（原調），否則轉回原調整首歌就錯了
  assert.equal(toSourceChord('Em', 2), 'Dm');
  assert.equal(toSourceChord('A#m/G#', 1), 'Am/G');
  assert.equal(toSourceChord('Cmaj7', 0), 'Cmaj7', '沒轉調就原樣');
  assert.equal(toSourceChord('', 2), '');
});

test('★ 原調 → 畫面顯示值', () => {
  assert.equal(toShownChord('Dm', 2), 'Em');
  assert.equal(toShownChord('Am/G', 1), 'A#m/G#');
  assert.equal(toShownChord('Am/G', 1, true), 'Bbm/Ab');
});

test('★★ 編輯後再轉回原調，必須跟原本一致（來回不失真）', () => {
  for (const semi of [-5, -1, 1, 2, 7, 11]) {
    for (const chord of ['C', 'Am', 'Dm7', 'G7sus4', 'Am/G', 'F#m7b5']) {
      const shown = toShownChord(chord, semi);
      const back = toSourceChord(shown, semi);
      assert.equal(toShownChord(back, semi), shown, `${chord} 移調 ${semi} 來回失真`);
    }
  }
});

test('行範圍與標記偵測', () => {
  assert.deepEqual(lineRangeAt('abc\ndef', 5), { start: 4, end: 7 });
  assert.deepEqual(lineRangeAt('abc', 1), { start: 0, end: 3 });
  assert.deepEqual(tagAt('a[C]b', 2), { start: 1, end: 4 });
  assert.equal(tagAt('abc', 1), null);
});
