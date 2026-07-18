/**
 * chordedit.js — 在渲染好的樂譜上直接編輯和弦
 *
 * 全部是對「原始碼字串」做手術的純函式：吃 source + 座標，吐新的 source。
 * 這樣做而不是「改 AST 再重新產生原始碼」，是因為重產會弄丟使用者的排版、
 * 空行、註解與指令順序 —— 那些都是他手寫的東西，不該被工具重寫。
 *
 * 座標由 chordpro.js 的 parseChordLine 提供（chordStart / chordEnd / textStart）。
 */

import { transposeChord } from './chords.js';

/** 找出 pos 所在那一行的範圍 */
export function lineRangeAt(source, pos) {
  const start = source.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
  let end = source.indexOf('\n', pos);
  if (end === -1) end = source.length;
  return { start, end };
}

/** pos 是不是落在某個 [..] 標記內部（含邊界） */
export function tagAt(source, pos) {
  const open = source.lastIndexOf('[', Math.max(0, pos - 1));
  if (open === -1) return null;
  const close = source.indexOf(']', open);
  if (close === -1 || close < pos - 1) return null;
  // 中間不可以再有 '['，否則就不是同一個標記
  if (source.slice(open + 1, close).includes('[')) return null;
  return { start: open, end: close + 1 };
}

/**
 * 換掉一個和弦。傳入空字串等同刪除。
 * @returns {{source:string, start:number, end:number}}
 */
export function replaceChord(source, start, end, newChord) {
  const c = String(newChord ?? '').trim();
  if (!c) return removeChord(source, start, end);
  const tag = '[' + c + ']';
  return {
    source: source.slice(0, start) + tag + source.slice(end),
    start,
    end: start + tag.length,
  };
}

/** 刪掉一個和弦 */
export function removeChord(source, start, end) {
  return { source: source.slice(0, start) + source.slice(end), start, end: start };
}

/**
 * 把和弦往左/右搬一個字元。
 * @param {number} dir -1 左移、+1 右移
 * @returns {{source, start, end, moved}} moved=false 表示已經到行首/行尾
 */
export function moveChord(source, start, end, dir) {
  const tag = source.slice(start, end);
  const rest = source.slice(0, start) + source.slice(end); // 先把標記拿起來

  // 行邊界要在「拿掉標記之後」的字串上算，座標才不會歪
  const { start: lineStart, end: lineEnd } = lineRangeAt(rest, start);

  let pos = start + dir;
  if (pos < lineStart || pos > lineEnd) {
    return { source, start, end, moved: false }; // 不跨行
  }

  // 若落在另一個和弦標記中間，整個跳過去（[C][G]x 右移 C → [G][C]x）
  const hit = tagAt(rest, pos);
  if (hit && pos > hit.start && pos < hit.end) {
    pos = dir > 0 ? hit.end : hit.start;
    if (pos < lineStart || pos > lineEnd) return { source, start, end, moved: false };
  }

  if (pos === start) return { source, start, end, moved: false };

  return {
    source: rest.slice(0, pos) + tag + rest.slice(pos),
    start: pos,
    end: pos + tag.length,
    moved: true,
  };
}

/**
 * 把和弦搬到指定的字元位置（拖曳用）
 *
 * 跟 moveChord 的差別：那個是「相對移動一格」，這個是「絕對搬到某處」。
 * 拖曳是明確的意圖表達，所以允許跨行 —— 使用者把和弦拖到別行歌詞上，
 * 那就是他要的。方向鍵不允許跨行是因為那容易誤觸。
 *
 * @returns {{source, start, end, moved}}
 */
export function moveChordTo(source, start, end, targetPos) {
  if (targetPos >= start && targetPos <= end) {
    return { source, start, end, moved: false }; // 拖回自己身上 = 沒動
  }

  const tag = source.slice(start, end);
  const rest = source.slice(0, start) + source.slice(end);

  // 目標在標記後方的話，座標要扣掉被拿走的標記長度
  let pos = targetPos > end ? targetPos - (end - start) : targetPos;
  pos = Math.max(0, Math.min(rest.length, pos));

  // 不可插進另一個標記中間，否則會產生 [[C]G] 這種壞掉的東西
  const hit = tagAt(rest, pos);
  if (hit && pos > hit.start && pos < hit.end) pos = hit.end;

  if (pos === start) return { source, start, end, moved: false };

  return {
    source: rest.slice(0, pos) + tag + rest.slice(pos),
    start: pos,
    end: pos + tag.length,
    moved: true,
  };
}

/** 在指定位置插入新和弦 */
export function insertChord(source, pos, chord = 'C') {
  const c = String(chord ?? '').trim() || 'C';
  const tag = '[' + c + ']';
  return { source: source.slice(0, pos) + tag + source.slice(pos), start: pos, end: pos + tag.length };
}

/* ------------------------------------------------------------------ *
 * 轉調狀態下的編輯
 * ------------------------------------------------------------------ */

/**
 * 使用者在轉調狀態下看到的是「移調後」的和弦，但原始碼存的是原調。
 * 存回去之前必須反向轉調，否則原調會被悄悄改掉 ——
 * 轉回原調時整首歌就錯了，而且使用者不會馬上發現。
 *
 * @param {string} shown     使用者輸入/看到的和弦（移調後）
 * @param {number} semitones 目前移調量
 * @param {boolean} useFlat
 * @returns {string} 該寫回原始碼的和弦（原調）
 */
export function toSourceChord(shown, semitones = 0, useFlat = false) {
  const s = String(shown ?? '').trim();
  if (!s || !semitones) return s;
  return transposeChord(s, -semitones, useFlat);
}

/** 反過來：原始碼的和弦 → 畫面上該顯示的樣子 */
export function toShownChord(sourceChord, semitones = 0, useFlat = false) {
  const s = String(sourceChord ?? '').trim();
  if (!s || !semitones) return s;
  return transposeChord(s, semitones, useFlat);
}
