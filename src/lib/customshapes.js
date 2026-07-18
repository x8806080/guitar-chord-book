/**
 * customshapes.js — 使用者自訂的和弦指型
 *
 * 演算法算出來的指型不一定是你想要的按法。這裡讓你存自己的版本，
 * 引擎會優先用它覆蓋演算法結果。
 *
 * 存法：以「和弦的音高特徵」為 key，而不是字面。
 *   這樣 C#m 和 Dbm 會共用同一個自訂指型（它們是同一個和弦的兩種寫法），
 *   不會發生「改了 C#m，Dbm 卻還是舊的」這種鬼打牆。
 *
 * 資料放 localStorage，並掛進歌譜的 export/import 與 GitHub 同步一起走。
 */

import { parseChord, noteToPitch } from './chords.js';

const KEY = 'gcb.customshapes.v1';

/** 把和弦正規化成音高 key：根音音高 | quality | 低音音高 */
export function chordKey(chordStr) {
  const c = parseChord(chordStr);
  if (!c) return null;
  const root = noteToPitch(c.root);
  if (root === null) return null;
  const bass = c.bass ? noteToPitch(c.bass) : '';
  return `${root}|${c.quality}|${bass}`;
}

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
};
const write = (obj) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
    return true;
  } catch (e) {
    console.error('自訂指型儲存失敗', e);
    return false;
  }
};

/** 全部自訂指型（給 export / 同步用） */
export const getAllCustom = () => read();

/** 取某和弦的自訂指型；沒有回 null */
export function getCustomShape(chordStr) {
  const k = chordKey(chordStr);
  if (!k) return null;
  const all = read();
  return all[k] ? { ...all[k].shape, source: 'custom' } : null;
}

/**
 * 存一個自訂指型
 * @param {string} chordStr 和弦名（存的是音高 key，寫法不影響）
 * @param {object} shape    { frets:number[6], baseFret:number, barre:object|null }
 */
export function saveCustomShape(chordStr, shape) {
  const k = chordKey(chordStr);
  if (!k) return false;
  const all = read();
  all[k] = { name: normalizeName(chordStr), shape: cleanShape(shape), updatedAt: new Date().toISOString() };
  return write(all);
}

/** 刪掉自訂指型，讓引擎回到演算法版本 */
export function deleteCustomShape(chordStr) {
  const k = chordKey(chordStr);
  if (!k) return false;
  const all = read();
  if (!all[k]) return false;
  delete all[k];
  return write(all);
}

/** 整包取代（同步合併後呼叫） */
export function replaceAllCustom(obj) {
  return write(obj && typeof obj === 'object' ? obj : {});
}

/** 合併兩份自訂指型，同 key 取較新的（給雲端同步用，跟歌譜同一套邏輯） */
export function mergeCustom(local = {}, remote = {}) {
  const out = { ...remote };
  for (const [k, v] of Object.entries(local)) {
    if (!out[k] || (v.updatedAt || '') >= (out[k].updatedAt || '')) out[k] = v;
  }
  return out;
}

/** 顯示用：把和弦名去掉多餘空白 */
function normalizeName(s) {
  return String(s).trim();
}

/** 只留下需要的欄位，避免把一堆演算法產生的雜訊也存進去 */
function cleanShape(shape) {
  const frets = Array.isArray(shape?.frets) ? shape.frets.slice(0, 6).map((f) => (f < 0 ? -1 : Math.max(0, Math.min(24, f | 0))) ) : [-1, -1, -1, -1, -1, -1];
  while (frets.length < 6) frets.push(-1);
  const pressed = frets.filter((f) => f > 0);
  const hasOpen = frets.some((f) => f === 0);
  const minFret = pressed.length ? Math.min(...pressed) : 1;
  const baseFret = hasOpen || minFret <= 1 ? 1 : minFret;
  return {
    frets,
    baseFret,
    barre: shape?.barre && Number.isFinite(shape.barre.fret) ? {
      fret: shape.barre.fret, from: shape.barre.from, to: shape.barre.to,
    } : null,
  };
}
