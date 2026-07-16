/**
 * chords.js — 十二平均律轉調引擎
 * 純函式、無副作用，可單獨在 Node 或瀏覽器執行（方便寫測試）。
 */

// 12 個半音的兩套拼法（enharmonic spelling）
export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// 自然音級的絕對音高（以 C = 0 為基準）
const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * 和弦文法：
 *   根音      = [A-G] + 可選升降記號（最多兩個，支援 C##、Bbb）
 *   屬性 quality = 剩下不含 '/' 的字元（m, maj7, sus4, add9, 7b5, dim, °, Δ ...）
 *   低音 bass  = '/' 之後的音名（分割和弦 slash chord，如 Am/G）
 */
const CHORD_RE = /^([A-G](?:#{1,2}|b{1,2})?)([^/\s]*)(?:\/([A-G](?:#{1,2}|b{1,2})?))?$/;

/** 不需轉調的標記 */
const NON_CHORD = new Set(['N.C.', 'NC', '%', '/', '//', '|', '||', '-', 'x', 'X']);

/** 音名 → 0~11 音高，失敗回傳 null */
export function noteToPitch(note) {
  if (!note) return null;
  const m = /^([A-G])(#{1,2}|b{1,2})?$/.exec(note);
  if (!m) return null;
  let p = NATURAL[m[1]];
  for (const ch of m[2] || '') p += ch === '#' ? 1 : -1;
  return ((p % 12) + 12) % 12;
}

/** 0~11 音高 → 音名 */
export function pitchToNote(pitch, useFlat = false) {
  const table = useFlat ? FLAT_NAMES : SHARP_NAMES;
  return table[((pitch % 12) + 12) % 12];
}

/**
 * 解析單一和弦字串
 * @returns {{root:string, quality:string, bass:string|null}|null}
 */
export function parseChord(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || NON_CHORD.has(s)) return null;
  const m = CHORD_RE.exec(s);
  if (!m) return null;
  return { root: m[1], quality: m[2] || '', bass: m[3] || null };
}

/** 是否為合法和弦 */
export const isChord = (raw) => parseChord(raw) !== null;

/**
 * 轉調單一和弦（保留 quality 與 slash bass）
 * @param {string} raw       原和弦，例如 'Am/G'、'Cmaj7'
 * @param {number} semitones 位移半音數（可正可負）
 * @param {boolean} useFlat  輸出採降記號拼法
 * @returns {string} 轉調後和弦；無法解析時原樣回傳（保留 N.C.、| 等記號）
 */
export function transposeChord(raw, semitones, useFlat = false) {
  const c = parseChord(raw);
  if (!c) return raw;
  const root = pitchToNote(noteToPitch(c.root) + semitones, useFlat);
  const bass = c.bass ? '/' + pitchToNote(noteToPitch(c.bass) + semitones, useFlat) : '';
  return root + c.quality + bass;
}

/** 一格 [] 內可能有多個和弦（如 "C G"），逐一轉調後組回 */
export function transposeChordToken(token, semitones, useFlat = false) {
  return token
    .split(/(\s+)/)
    .map((t) => (/^\s+$/.test(t) ? t : transposeChord(t, semitones, useFlat)))
    .join('');
}

/* ------------------------------------------------------------------ *
 * 調性（Key）判斷與拼法偏好
 * ------------------------------------------------------------------ */

/** 五度圈：這些大調（及其關係小調）習慣寫降記號 */
const FLAT_MAJOR_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb']);

/** 判斷某個調性下應該用 # 還是 b */
export function preferFlat(keyRoot, isMinor = false) {
  const pitch = noteToPitch(keyRoot);
  if (pitch === null) return false;
  // 小調先換算成關係大調（+3 半音）再查表
  const majorPitch = isMinor ? (pitch + 3) % 12 : pitch;
  const sharpName = SHARP_NAMES[majorPitch];
  const flatName = FLAT_NAMES[majorPitch];
  return FLAT_MAJOR_KEYS.has(flatName) || FLAT_MAJOR_KEYS.has(sharpName);
}

/**
 * 以「第一個出現的和弦」推定原調（實務上對流行吉他譜命中率高）
 * @param {string[]} chordTokens 依序出現的和弦字串
 * @returns {{root:string, minor:boolean, label:string}|null}
 */
export function detectKey(chordTokens) {
  for (const t of chordTokens) {
    const c = parseChord(t);
    if (!c) continue;
    const minor = /^m(?!aj)/.test(c.quality);
    return { root: c.root, minor, label: c.root + (minor ? 'm' : '') };
  }
  return null;
}

/** 顯示目前調性：原調 + 位移量 */
export function currentKeyLabel(baseKey, semitones) {
  if (!baseKey) return '—';
  const useFlat = preferFlat(baseKey.root, baseKey.minor) && semitones !== 0;
  const root = pitchToNote(noteToPitch(baseKey.root) + semitones, useFlat);
  return root + (baseKey.minor ? 'm' : '');
}

/** 把位移量正規化到 -11 ~ +11（八度等價） */
export const normalizeSemitones = (n) => {
  const r = n % 12;
  return r;
};
