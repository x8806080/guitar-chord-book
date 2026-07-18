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

test('★★ 拖曳：搬到任意位置', async () => {
  const { moveChordTo } = await import('../src/lib/chordedit.js');
  const src = '[C]Twinkle, [F]little';
  const p = chordAt(src, 0);

  // 用 indexOf 算目標位置，不要硬編數字（硬編一定會數錯）
  const r = moveChordTo(src, p.chordStart, p.chordEnd, src.indexOf('little'));
  assert.equal(r.source, 'Twinkle, [F][C]little', r.source);
  assert.equal(r.source.slice(r.start, r.end), '[C]', '回傳座標要對得上');

  // 拖到單字中間也可以
  const r2 = moveChordTo(src, p.chordStart, p.chordEnd, src.indexOf('ittle'));
  assert.equal(r2.source, 'Twinkle, [F]l[C]ittle', r2.source);
});

test('★★ 拖曳：往前搬', async () => {
  const { moveChordTo } = await import('../src/lib/chordedit.js');
  const src = 'Twinkle, [F]little';
  const p = chordAt(src, 0);
  assert.equal(moveChordTo(src, p.chordStart, p.chordEnd, src.indexOf('nkle')).source, 'Twi[F]nkle, little');
});

test('★★ 拖曳：允許跨行（拖曳是明確意圖，不像方向鍵容易誤觸）', async () => {
  const { moveChordTo } = await import('../src/lib/chordedit.js');
  const src = '[C]abc\ndef';
  const p = chordAt(src, 0);
  const r = moveChordTo(src, p.chordStart, p.chordEnd, src.indexOf('ef')); // 第二行的 e
  assert.equal(r.moved, true);
  assert.equal(r.source, 'abc\nd[C]ef', r.source);
});

test('★★ 拖曳：不可插進另一個標記中間', async () => {
  const { moveChordTo } = await import('../src/lib/chordedit.js');
  const src = 'a[C]b[G]c';
  const p = chordAt(src, 0); // [C] at 1..4
  // 目標落在 [G] 中間（原座標 6，也就是 [G] 的 G 那一格）
  const r = moveChordTo(src, p.chordStart, p.chordEnd, 6);
  assert.ok(!r.source.includes('[['), r.source);
  assert.ok(!r.source.includes(']]'), r.source);
  assert.equal(r.source.replace(/\[[^\]]*\]/g, ''), 'abc', '歌詞不可被動到');
});

test('★ 拖回原地 = 沒動', async () => {
  const { moveChordTo } = await import('../src/lib/chordedit.js');
  const src = '[C]abc';
  const p = chordAt(src, 0);
  const r = moveChordTo(src, p.chordStart, p.chordEnd, 1);
  assert.equal(r.moved, false);
  assert.equal(r.source, src);
});

test('★★ 拖到任何位置都不可弄丟和弦或動到歌詞', async () => {
  const { moveChordTo } = await import('../src/lib/chordedit.js');
  const base = '[C]Twinkle, [F]little [G]star';
  for (let target = 0; target <= base.length; target++) {
    const p = chordAt(base, 1); // 搬 [F]
    const r = moveChordTo(base, p.chordStart, p.chordEnd, target);
    assert.equal(r.source.replace(/\[[^\]]*\]/g, ''), 'Twinkle, little star', `拖到 ${target} 動到歌詞：${r.source}`);
    const chords = [...r.source.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]).sort();
    assert.deepEqual(chords, ['C', 'F', 'G'], `拖到 ${target} 弄丟和弦：${r.source}`);
    assert.ok(!r.source.includes('[['), `拖到 ${target} 產生壞標記：${r.source}`);
  }
});

test('★★ 編輯歌詞只換指定範圍，不可碰到和弦標記', async () => {
  const { replaceText } = await import('../src/lib/chordedit.js');
  const src = '[C]Twinkle, [F]little';
  const start = src.indexOf('Twinkle,');
  const r = replaceText(src, start, start + 'Twinkle,'.length, 'Sparkle,');
  assert.equal(r.source, '[C]Sparkle, [F]little');
  assert.equal(r.source.slice(r.start, r.end), 'Sparkle,');
});

test('★★ 歌詞裡打方括號要轉全形，否則會被當成和弦標記', async () => {
  const { replaceText } = await import('../src/lib/chordedit.js');
  const src = '[C]abc';
  const r = replaceText(src, 3, 6, 'a[G]b');
  assert.ok(!r.source.includes('[G]'), '不可產生假和弦：' + r.source);
  assert.equal(r.source, '[C]a［G］b');

  // 確認解析後仍只有原本那一個和弦
  const chords = [];
  for (const b of parseChordPro(r.source).blocks)
    for (const l of b.lines) for (const p of l.pairs ?? []) if (p.chord) chords.push(p.chord);
  assert.deepEqual(chords, ['C']);
});

test('★★ 歌詞裡貼上換行要吃掉，否則整行會被拆開、和弦全跑掉', async () => {
  const { replaceText } = await import('../src/lib/chordedit.js');
  const src = '[C]abc [F]def';
  const r = replaceText(src, 3, 6, 'a\nb\r\nc');
  assert.ok(!r.source.includes('\n'), r.source);
  assert.equal(r.source, '[C]a b c [F]def');
});

test('★ 編輯歌詞後和弦數量不變', async () => {
  const { replaceText } = await import('../src/lib/chordedit.js');
  const src = '[C]Twinkle, [F]little [G]star';
  const start = src.indexOf('little');
  const r = replaceText(src, start, start + 6, '很長很長的中文歌詞');
  const chords = [...r.source.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]);
  assert.deepEqual(chords, ['C', 'F', 'G']);
});

test('清空歌詞不會爆', async () => {
  const { replaceText } = await import('../src/lib/chordedit.js');
  assert.equal(replaceText('[C]abc', 3, 6, '').source, '[C]');
  assert.equal(replaceText('[C]abc', 3, 6, null).source, '[C]');
});

test('★ 插入文字（空格）', async () => {
  const { insertText } = await import('../src/lib/chordedit.js');
  const src = '[C]abc';
  assert.equal(insertText(src, 4, ' ').source, '[C]a bc');
  assert.equal(insertText(src, 3, '  ').source, '[C]  abc');
});

test('★★ Backspace 刪字元', async () => {
  const { deleteBefore } = await import('../src/lib/chordedit.js');
  const r = deleteBefore('[C]abc', 5); // 刪 b
  assert.equal(r.source, '[C]ac');
  assert.equal(r.removed, 'char');
});

test('★★ Backspace 碰到和弦標記要整個刪，不可只刪 ]', async () => {
  const { deleteBefore } = await import('../src/lib/chordedit.js');
  const r = deleteBefore('ab[C]cd', 5); // 游標在 ] 右邊
  assert.equal(r.source, 'abcd', '整個 [C] 要一起消失');
  assert.equal(r.removed, 'chord');
  // 不可留下殘骸
  assert.ok(!r.source.includes('['));
  assert.ok(!r.source.includes(']'));
});

test('★ Backspace 在開頭不會爆', async () => {
  const { deleteBefore } = await import('../src/lib/chordedit.js');
  const r = deleteBefore('abc', 0);
  assert.equal(r.source, 'abc');
  assert.equal(r.removed, null);
});

test('★★ 換行鈕把一行斷成兩行，和弦不跑掉', async () => {
  const { breakLine } = await import('../src/lib/chordedit.js');
  const src = '[C]abc [F]def';
  const pos = src.indexOf(' [F]'); // 在 abc 之後斷開
  const r = breakLine(src, pos);
  assert.equal(r.source, '[C]abc\n [F]def');
  const lines = parseChordPro(r.source).blocks[0].lines;
  assert.equal(lines.length, 2, '應該變成兩行');
  const chords = [];
  for (const l of lines) for (const p of l.pairs) if (p.chord) chords.push(p.chord);
  assert.deepEqual(chords, ['C', 'F']);
});

test('★★ 合併下一行', async () => {
  const { joinNextLine } = await import('../src/lib/chordedit.js');
  const src = '[C]abc\n[F]def';
  const r = joinNextLine(src, 0);
  assert.equal(r.source, '[C]abc[F]def');
  assert.equal(r.joined, true);
});

test('★ 最後一行合併不會爆（沒有下一行）', async () => {
  const { joinNextLine } = await import('../src/lib/chordedit.js');
  const r = joinNextLine('[C]abc', 0);
  assert.equal(r.joined, false);
  assert.equal(r.source, '[C]abc');
});

test('★★ 行尾插入和弦（模擬行尾＋鈕）', async () => {
  const { insertChord } = await import('../src/lib/chordedit.js');
  const src = '[C]abc';   // 想在 abc 之後、行尾加一個和弦
  const r = insertChord(src, src.length, 'G');
  assert.equal(r.source, '[C]abc[G]');
  const pairs = parseChordPro(r.source).blocks[0].lines[0].pairs;
  const chords = pairs.filter((p) => p.chord).map((p) => p.chord);
  assert.deepEqual(chords, ['C', 'G']);
});
