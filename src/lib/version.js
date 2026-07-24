/**
 * version.js — 修改版次
 *
 * 格式：YYYYMMDD + 字母序（同一天的第幾次改版）
 *   20260717a → 20260717b → … → 20260717z → 20260717aa
 *
 * 用 `npm run bump` 自動遞增，不要手改（手改容易忘記或打錯日期）。
 *
 * 版次顯示在畫面右上角。這不只是好看 ——
 * GitHub Pages 對 index.html 有快取，推上去之後你需要一個方法確認
 * 「線上到底是不是最新版」。看版號最快。
 */

export const VERSION = '20260724a';

/**
 * 字母序遞增：a→b、z→aa、az→ba、zz→aaa
 * 一天 26 次改版通常夠用，但還是把進位做完整。
 */
export function nextLetter(s) {
  if (!s) return 'a';
  const arr = [...String(s)];
  let i = arr.length - 1;
  while (i >= 0) {
    if (arr[i] === 'z') {
      arr[i] = 'a';
      i--;
    } else {
      arr[i] = String.fromCharCode(arr[i].charCodeAt(0) + 1);
      return arr.join('');
    }
  }
  return 'a' + arr.join(''); // 全部進位（zz → aaa）
}

/**
 * 算出下一個版次
 * @param {string} current 目前版次，例如 '20260717c'
 * @param {string} today   今天日期 YYYYMMDD
 */
export function nextVersion(current, today) {
  const m = /^(\d{8})([a-z]*)$/.exec(String(current || ''));
  if (!m || m[1] !== today) return today + 'a'; // 換日或格式壞掉 → 從 a 開始
  return today + nextLetter(m[2] || 'a');
}

/** 取本地日期 YYYYMMDD（不可用 toISOString，那是 UTC，台灣半夜會算成前一天） */
export function todayStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/** 拆成人看得懂的樣子：20260717a → 2026/07/17 a */
export function formatVersion(v = VERSION) {
  const m = /^(\d{4})(\d{2})(\d{2})([a-z]*)$/.exec(String(v));
  if (!m) return String(v);
  return `${m[1]}/${m[2]}/${m[3]} ${m[4]}`;
}
