/**
 * chordshapes.js — 吉他和弦指型引擎（三層混合架構）
 *
 * 優先序由高到低：
 *   1. 開放和弦查表   —— 吉他手公認的標準指型，人體工學無可爭議
 *   2. CAGED 移動型   —— 把 E/A 型平移，涵蓋全部 12 個根音（F = E型移1品）
 *   3. 演算法生成     —— 接住 Cdim、A#m7b5 這類查表一定漏的罕見和弦
 *
 * 為什麼不純演算法：演算法算得出「正確的音」，算不出「人類會按的手型」。
 * 為什麼不純查表：轉調會產出任意和弦，查表必漏。
 *
 * frets 陣列一律是第6弦(低E) → 第1弦(高E)，-1 = 靜音，0 = 開放弦。
 */

import { parseChord, noteToPitch } from './chords.js';

export const STANDARD_TUNING = [4, 9, 2, 7, 11, 4]; // EADGBE
const MAX_FRET = 12;
const MAX_SPAN = 4;
const MAX_FINGERS = 4;

const norm = (n) => ((n % 12) + 12) % 12;
const decode = (s) => [...s].map((ch) => (ch === 'x' ? -1 : parseInt(ch, 36)));
export const shapeToString = (frets) =>
  frets.map((f) => (f < 0 ? 'x' : f.toString(36))).join('');

/* ------------------------------------------------------------------ *
 * 第 1 層：開放和弦標準指型
 * ------------------------------------------------------------------ */
const OPEN_CHORDS = {
  A: 'x02220', Am: 'x02210', A7: 'x02020', Am7: 'x02010', Amaj7: 'x02120',
  Asus2: 'x02200', Asus4: 'x02230', A7sus4: 'x02030', A6: 'x02222', Aadd9: 'x02420',
  B7: 'x21202', Bm7: 'x20202',
  C: 'x32010', C7: 'x32310', Cmaj7: 'x32000', Cadd9: 'x32030', C6: 'x32210', Csus4: 'x33010',
  D: 'xx0232', Dm: 'xx0231', D7: 'xx0212', Dm7: 'xx0211', Dmaj7: 'xx0222',
  Dsus2: 'xx0230', Dsus4: 'xx0233', D6: 'xx0202',
  E: '022100', Em: '022000', E7: '020100', Em7: '020000', Emaj7: '021100',
  Esus4: '022200', E7sus4: '020200', E6: '022120', Em6: '022020',
  F: '133211', Fmaj7: 'xx3210', Fm: '133111', F6: 'xx3231',
  G: '320003', G7: '320001', Gmaj7: '320002', G6: '320000', Gsus4: '330013',
  'C/E': '032010', 'C/G': '332010', 'D/F#': '200232', 'G/B': 'x20003',
  'Am/G': '302210', 'Em/B': 'x22000', 'F/C': 'x33211', 'A/C#': 'x42220',
};

/** 以音高建索引，讓 Db 也能命中 C# 的表 */
const OPEN_INDEX = new Map();
for (const [name, shape] of Object.entries(OPEN_CHORDS)) {
  const c = parseChord(name);
  if (!c) continue;
  OPEN_INDEX.set(
    noteToPitch(c.root) + '|' + c.quality + '|' + (c.bass ? noteToPitch(c.bass) : ''),
    shape
  );
}

/* ------------------------------------------------------------------ *
 * 第 2 層：CAGED 移動型
 * [指型, 該指型在開放把位時的根音音高]
 * 平移 n 品 = 根音升 n 個半音。F = E型(根音 E=4)移 1 品 → 133211
 * ------------------------------------------------------------------ */
const MOVABLE = {
  '':       [['022100', 4], ['x02220', 9]],
  m:        [['022000', 4], ['x02210', 9]],
  7:        [['020100', 4], ['x02020', 9]],
  m7:       [['020000', 4], ['x02010', 9]],
  maj7:     [['021100', 4], ['x02120', 9]],
  M7:       [['021100', 4], ['x02120', 9]],
  6:        [['022120', 4], ['x02222', 9]],
  m6:       [['022020', 4], ['x02212', 9]],
  sus4:     [['022200', 4], ['x02230', 9]],
  sus2:     [['x02200', 9]],
  '7sus4':  [['020200', 4], ['x02030', 9]],
  9:        [['020102', 4], ['x02423', 9]],
  m9:       [['x02413', 9]],
  m7b5:     [['x01213', 9]],
  dim7:     [['x01212', 9]],
  aug:      [['032110', 4], ['x03221', 9]],
  add9:     [['x02420', 9]],
  5:        [['022xxx', 4], ['x022xx', 9]],
};

/** 把指型平移 n 品；靜音維持靜音 */
const shiftShape = (shape, n) => decode(shape).map((f) => (f < 0 ? -1 : f + n));

/* ------------------------------------------------------------------ *
 * 手型分析：大橫按、手指數、把位
 * ------------------------------------------------------------------ */
export function analyzeShape(frets) {
  if (frets.filter((f) => f >= 0).length < 3) return null;
  if (frets.some((f) => f > MAX_FRET + MAX_SPAN)) return null;

  const pressed = frets.filter((f) => f > 0);
  if (pressed.length === 0) {
    return { frets, baseFret: 1, barre: null, fingers: 0, span: 1 };
  }

  const minFret = Math.min(...pressed);
  const maxFret = Math.max(...pressed);
  const span = maxFret - minFret + 1;
  if (span > MAX_SPAN) return null;

  // 大橫按判定
  // 關鍵：只有在「不橫按就超過四根手指」時才橫按。
  // 否則 Em(022000) 會被誤判成橫按 —— 沒有人這樣彈 Em，
  // A(x02220) 也是三根手指按，不是橫按。
  const atMin = frets.map((f, i) => (f === minFret ? i : -1)).filter((i) => i >= 0);
  let barre = null;
  let fingers = pressed.length;

  if (fingers > MAX_FINGERS && atMin.length >= 2) {
    const from = atMin[0];
    const to = atMin[atMin.length - 1];
    // 橫按範圍內有開放弦就不可能橫按（食指會壓到它）
    if (!frets.slice(from, to + 1).some((f) => f === 0)) {
      barre = { fret: minFret, from, to };
      fingers = 1 + pressed.filter((f) => f !== minFret).length;
    }
  }
  if (fingers > MAX_FINGERS) return null;

  // 有開放弦就一定要從第 1 品畫起（圖上要畫出上弦枕），
  // 否則 D(xx0232) 會被畫成「從第 2 品開始」而看不到開放弦。
  const hasOpen = frets.some((f) => f === 0);
  const baseFret = hasOpen || minFret <= 1 ? 1 : minFret;
  if (baseFret === 1 && maxFret > MAX_SPAN) return null; // 從第1品畫但畫不下

  return { frets, baseFret, barre, fingers, span };
}

/** 評分：越低越好。權重照「初學者好不好按」調 */
function scoreShape(a) {
  const { frets, barre, fingers, span } = a;
  const pressed = frets.filter((f) => f > 0);
  const minFret = pressed.length ? Math.min(...pressed) : 0;
  const opens = frets.filter((f) => f === 0).length;
  const mutes = frets.filter((f) => f < 0).length;
  const sounding = frets.filter((f) => f >= 0).length;

  let s = 0;
  s += minFret * 2.5;          // 低把位優先
  s += span * 1.8;             // 跨度小優先
  s += fingers * 2.0;          // 手指少優先
  s -= opens * 1.0;            // 開放弦好按
  s += mutes * 0.8;            // 靜音弦略扣
  if (barre) s += 2.0;         // 橫按較難
  if (sounding <= 3) s += 3.0; // 只有三條弦太單薄
  return Math.round(s * 100) / 100;
}

/* ------------------------------------------------------------------ *
 * 第 3 層：演算法生成
 * ------------------------------------------------------------------ */
export const CHORD_FORMULAS = [
  ['maj9', [0, 4, 7, 11, 2]], ['maj7', [0, 4, 7, 11]], ['M7', [0, 4, 7, 11]],
  ['m7b5', [0, 3, 6, 10]], ['m7-5', [0, 3, 6, 10]], ['ø', [0, 3, 6, 10]],
  ['mmaj7', [0, 3, 7, 11]], ['mM7', [0, 3, 7, 11]],
  ['dim7', [0, 3, 6, 9]], ['°7', [0, 3, 6, 9]], ['dim', [0, 3, 6]], ['°', [0, 3, 6]],
  ['aug', [0, 4, 8]], ['+', [0, 4, 8]],
  ['7sus4', [0, 5, 7, 10]], ['7sus2', [0, 2, 7, 10]], ['7sus', [0, 5, 7, 10]],
  ['sus4', [0, 5, 7]], ['sus2', [0, 2, 7]], ['sus', [0, 5, 7]],
  ['add9', [0, 4, 7, 2]], ['add11', [0, 4, 7, 5]],
  ['m11', [0, 3, 7, 10, 2, 5]], ['m9', [0, 3, 7, 10, 2]], ['m6', [0, 3, 7, 9]],
  ['m7', [0, 3, 7, 10]], ['m', [0, 3, 7]],
  ['13', [0, 4, 7, 10, 9]], ['11', [0, 4, 7, 10, 5]], ['9', [0, 4, 7, 10, 2]],
  ['7b9', [0, 4, 7, 10, 1]], ['7#9', [0, 4, 7, 10, 3]],
  ['7b5', [0, 4, 6, 10]], ['7#5', [0, 4, 8, 10]],
  ['6/9', [0, 4, 7, 9, 2]], ['69', [0, 4, 7, 9, 2]], ['6', [0, 4, 7, 9]],
  ['7', [0, 4, 7, 10]], ['5', [0, 7]], ['', [0, 4, 7]],
];

export function qualityToIntervals(quality = '') {
  const q = String(quality).trim();
  for (const [key, intervals] of CHORD_FORMULAS) {
    if (q === key) {
      return {
        intervals,
        third: intervals.find((i) => i === 3 || i === 4) ?? null,
        seventh: intervals.find((i) => i === 10 || i === 11) ?? null,
      };
    }
  }
  return null;
}

function isPlayableMusic(frets, tuning, targets, required, lowest) {
  const snd = frets.map((fr, i) => (fr < 0 ? null : norm(tuning[i] + fr)));
  const played = snd.filter((p) => p !== null);
  if (played.length < 3) return false;
  if (played.some((p) => !targets.has(p))) return false;
  // 必要音一個都不能少（含根音本身 —— slash chord 很容易把根音弄丟）
  for (const r of required) if (!played.includes(r)) return false;

  const first = snd.findIndex((p) => p !== null);
  if (snd[first] !== lowest) return false; // 最低音必須是根音 / slash 低音

  // 內部靜音：只允許 1 條且必須在低音側（拇指或指腹悶弦，如 G7sus4 = 3x0011）
  const last = 5 - [...snd].reverse().findIndex((p) => p !== null);
  let inner = 0;
  for (let i = first; i <= last; i++) {
    if (snd[i] === null) {
      inner++;
      if (i > 2 || inner > 1) return false;
    }
  }
  return true;
}

function algorithmic(c, tuning) {
  const f = qualityToIntervals(c.quality);
  if (!f) return [];
  const rootPitch = noteToPitch(c.root);
  const bassPitch = c.bass ? noteToPitch(c.bass) : null;
  const targets = new Set(f.intervals.map((i) => norm(rootPitch + i)));
  if (bassPitch !== null) targets.add(bassPitch);
  const lowest = bassPitch !== null ? bassPitch : rootPitch;

  // 哪些音不可省略：
  //   只有「完全五度」在四音以上的和弦裡可以省（吉他只有六條弦，五度最不影響性格）。
  //   根音、三度、七度、以及 9/11/13 這些特徵延伸音，一律必要。
  const canDropFifth = f.intervals.includes(7) && f.intervals.length >= 4;
  const required = f.intervals
    .filter((i) => !(canDropFifth && i === 7))
    .map((i) => norm(rootPitch + i));

  const out = [];
  for (let pos = 0; pos <= MAX_FRET - MAX_SPAN + 1; pos++) {
    const cand = tuning.map((open) => {
      const list = [-1];
      const lo = pos === 0 ? 0 : pos;
      for (let fr = lo; fr < pos + MAX_SPAN && fr <= MAX_FRET; fr++) {
        if (targets.has(norm(open + fr))) list.push(fr);
      }
      if (pos > 0 && pos <= 3 && targets.has(norm(open)) && !list.includes(0)) list.push(0);
      return list;
    });

    const build = (i, acc) => {
      if (i === 6) {
        if (isPlayableMusic(acc, tuning, targets, required, lowest)) {
          const a = analyzeShape(acc);
          if (a) out.push({ ...a, source: 'algo', score: scoreShape(a) });
        }
        return;
      }
      for (const fr of cand[i]) build(i + 1, [...acc, fr]);
    };
    build(0, []);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 對外 API
 * ------------------------------------------------------------------ */

// 指型只跟和弦名有關，算過就不用再算（轉調來回時省下重算）
const CACHE = new Map();

/**
 * 產生和弦指型，依好按程度排序
 * @returns {Array<{frets, baseFret, barre, fingers, span, source, score}>}
 *          source: 'open'（標準開放指型）| 'caged'（移動型）| 'algo'（演算法）
 */
export function generateShapes(chordStr, opts = {}) {
  const { tuning = STANDARD_TUNING, maxResults = 4 } = opts;
  const cacheKey = chordStr + '|' + maxResults + '|' + tuning.join('');
  if (CACHE.has(cacheKey)) return CACHE.get(cacheKey);
  const c = parseChord(chordStr);
  if (!c) { CACHE.set(cacheKey, []); return []; }

  const rootPitch = noteToPitch(c.root);
  if (rootPitch === null) { CACHE.set(cacheKey, []); return []; }

  const out = [];

  // 1. 開放和弦表
  const key = rootPitch + '|' + c.quality + '|' + (c.bass ? noteToPitch(c.bass) : '');
  const openShape = OPEN_INDEX.get(key);
  if (openShape) {
    const a = analyzeShape(decode(openShape));
    if (a) out.push({ ...a, source: 'open', score: scoreShape(a) - 100 });
  }

  // 2. CAGED 移動型（分割和弦不適用，低音會跑掉）
  if (!c.bass) {
    for (const [shape, openRoot] of MOVABLE[c.quality] ?? []) {
      const shift = norm(rootPitch - openRoot);
      if (shift === 0) continue; // 開放把位已由第 1 層處理
      if (shift > 9) continue;   // 把位太高，換另一個型更好按
      const a = analyzeShape(shiftShape(shape, shift));
      if (a) out.push({ ...a, source: 'caged', score: scoreShape(a) - 50 });
    }
  }

  // 3. 演算法補齊
  out.push(...algorithmic(c, tuning));

  const seen = new Set();
  const result = out
    .filter((s) => {
      const k = shapeToString(s.frets);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, maxResults);

  CACHE.set(cacheKey, result);
  return result;
}

export const bestShape = (chordStr, opts) =>
  generateShapes(chordStr, { ...opts, maxResults: 1 })[0] ?? null;
