/**
 * grouping.js — 歌單分組
 *
 * 純函式放這裡而非元件裡：node --test 不認 JSX 語法，
 * 邏輯留在 .jsx 檔就永遠測不到。這也跟專案其他部分的分層一致。
 */

export const UNGROUPED = '未分類';

/**
 * 依歌手分組。
 * - 歌手名前後空白視為同一組（貼上時很容易多帶空白）
 * - 沒填歌手的歸「未分類」，永遠排最後
 * - 其餘用 zh-TW 排序，中文才會照筆劃排而不是 Unicode 碼位
 */
export function groupByArtist(songs = []) {
  const map = new Map();
  for (const s of songs) {
    const k = (s.artist || '').trim() || UNGROUPED;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(s);
  }
  return [...map.entries()].sort(([a], [b]) => {
    if (a === UNGROUPED) return 1;
    if (b === UNGROUPED) return -1;
    return a.localeCompare(b, 'zh-TW');
  });
}
