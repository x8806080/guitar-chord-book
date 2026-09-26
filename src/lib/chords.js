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
 * 正規化和弦寫法：把括號式的加註延伸音轉成標準 quality。
 *
 * 各家譜（尤其 e-chords 這類）常用括號標延伸音，音樂上等同標準寫法：
 *   Em7(9)   = Em9      （7 和弦再加 9 度 = 9 和弦）
 *   A5(7/9)  = A9       （5 力量和弦再補 7、9 度，實際就是屬九和弦）
 *   C(add9)  = Cadd9
 *   G7(b9)   = G7b9     （括號內的升降記號原樣保留）
 *   D(9)     = Dadd9    （三和弦直接加 9，慣例是 add9）
 *
 * 規則：抽出所有括號內容攤平，去掉分隔用的 '/'，再依有沒有 7 度決定併法。
 * 這是「輸入清理」層 —— 只轉寫法，不改和弦的實際音。
 */
export function normalizeChordName(raw) {
  if (typeof raw !== 'string') return raw;
  let s = raw.trim();
  if (!s) return s;

  // slash bass（例如 C/G）要先保護起來，別跟括號內的 '/' 搞混
  let bass = '';
  const bassM = /\/([A-G](?:#{1,2}|b{1,2})?)\s*$/.exec(s);
  if (bassM) { bass = bassM[0]; s = s.slice(0, bassM.index); }

  if (!s.includes('(')) return s + bass;

  // 把所有括號內容收集起來，本體去掉括號
  const inside = [];
  const base = s.replace(/\(([^)]*)\)/g, (_, g) => { inside.push(g); return ''; });
  // 括號內容攤平：'7/9' → ['7','9']，去掉純分隔符
  const parts = inside.join('/').split('/').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return base + bass;

  const has = (t) => new RegExp(`(^|[^0-9])${t}([^0-9]|$)`).test(base) || parts.includes(t);
  const ext = parts.join('');

  // add9 特例：本體沒有七度、括號只是加個 9，慣例寫 add9
  if (parts.length === 1 && /^9$/.test(parts[0]) && !/7|9|11|13/.test(base)) {
    // A5(9) 這種也當 add9 處理；A5→A 讓它變 Aadd9 而非 A5add9
    return base.replace(/5$/, '') + 'add9' + bass;
  }

  // 力量和弦 A5(7/9)：5 只是省略三度，補上 7、9 後就是屬和弦，去掉 '5'
  let out = base.replace(/5$/, '');

  // 屬和弦的延伸音是階梯式的：13 隱含 11、9、7；11 隱含 9、7；9 隱含 7。
  // 所以 Em7(9) 不是「Em7 加 9」寫成 Em79，而是合併成最高階梯：Em9。
  // 要把 base 尾端「已經有的延伸數字」(Em7 的 7) 也一起納入計算，
  // 否則只看括號會漏掉它。變化音 (b9 #11 ...) 保留成後綴，不併入階梯。
  const ladder = [7, 9, 11, 13];
  let baseNum = null;
  const tailM = /(7|9|11|13)$/.exec(out);
  if (tailM) { baseNum = Number(tailM[1]); out = out.slice(0, tailM.index); } // 先把尾端數字拆下來

  const numeric = parts.filter((p) => /^\d+$/.test(p)).map(Number);
  const altered = parts.filter((p) => !/^\d+$/.test(p));
  const stacked = [...(baseNum !== null ? [baseNum] : []), ...numeric].filter((n) => ladder.includes(n));
  const nonLadder = numeric.filter((n) => !ladder.includes(n));

  if (stacked.length) out += String(Math.max(...stacked)); // 7,9 → 9；9,13 → 13
  else if (baseNum !== null) out += String(baseNum);        // 沒有階梯延伸就還原尾端數字
  if (nonLadder.length) out += nonLadder.join('');          // 6 之類非階梯音
  out += altered.join('');                                  // 補上變化音
  return out + bass;
}

/**
 * 解析單一和弦字串
 * @returns {{root:string, quality:string, bass:string|null}|null}
 */
export function parseChord(raw) {
  if (typeof raw !== 'string') return null;
  const s = normalizeChordName(raw.trim());
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
  if (typeof raw !== 'string') return raw;
  const s = raw.trim();
  // 先確認這是合法和弦（parseChord 會正規化括號寫法來判斷），不合法就原樣回傳
  if (!parseChord(s)) return raw;

  // 只把根音與 slash bass 換成新音，quality 保持「使用者原本打的樣子」——
  // 包含 (9)、(7/9) 這類括號寫法。這樣轉調後畫面仍與原譜一致，
  // 而算指型時由 parseChord/generateShapes 自己去正規化，兩者互不干擾。
  const ROOT = /^([A-G](?:#{1,2}|b{1,2})?)/;
  const rootM = ROOT.exec(s);
  if (!rootM) return raw;
  const newRoot = pitchToNote(noteToPitch(rootM[1]) + semitones, useFlat);

  // slash bass 在最後面，且其後不接括號（避免動到括號內的 '/'）
  const bassM = /\/([A-G](?:#{1,2}|b{1,2})?)(\s*)$/.exec(s);
  let body = s;
  let bassOut = '';
  if (bassM) {
    body = s.slice(0, bassM.index);
    bassOut = '/' + pitchToNote(noteToPitch(bassM[1]) + semitones, useFlat) + bassM[2];
  }
  const quality = body.slice(rootM[1].length); // 原始 quality，原樣保留
  return newRoot + quality + bassOut;
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
