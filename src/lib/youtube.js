/**
 * youtube.js — YouTube 連結解析
 *
 * 使用者會從各種地方複製連結：手機 App 分享、桌機網址列、短網址、含時間戳的段落連結。
 * 全部要接得住，而且解析失敗時要安靜地不顯示播放器，不能炸掉樂譜。
 *
 * 嵌入用的是 YouTube 官方 iframe 播放器（youtube-nocookie 網域），
 * 這是 YouTube 提供的正式功能，不涉及下載或重製。
 */

/** YouTube 影片 ID 一律是 11 個字元 */
const ID_RE = /^[\w-]{11}$/;

/**
 * 解析時間戳：支援 "90"、"90s"、"1m30s"、"1h2m3s"
 * @returns {number} 秒數
 */
export function parseTimestamp(t) {
  if (!t) return 0;
  const s = String(t).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(s);
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

/**
 * 從各種 YouTube 網址取出影片 ID 與起始秒數
 * @returns {{id:string, start:number}|null} 不是合法 YouTube 連結就回 null
 */
export function parseYouTube(input) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  // 直接給 ID
  if (ID_RE.test(raw)) return { id: raw, start: 0 };

  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
  } catch {
    return null;
  }

  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id = null;

  if (host === 'youtu.be') {
    id = u.pathname.split('/')[1];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const seg = u.pathname.split('/').filter(Boolean);
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(seg[0])) id = seg[1];
  } else {
    return null; // 不是 YouTube，不處理
  }

  if (!id || !ID_RE.test(id)) return null;

  const start = parseTimestamp(u.searchParams.get('t') || u.searchParams.get('start'));
  return { id, start };
}

/**
 * 產生嵌入網址
 * 用 youtube-nocookie.com：在使用者實際按下播放前不寫追蹤 cookie。
 */
export function buildEmbedUrl({ id, start = 0 }, { autoplay = false } = {}) {
  const p = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' });
  if (start > 0) p.set('start', String(start));
  if (autoplay) p.set('autoplay', '1');
  return `https://www.youtube-nocookie.com/embed/${id}?${p}`;
}

/** 給「在 YouTube 開啟」用的一般網址 */
export const buildWatchUrl = ({ id, start = 0 }) =>
  `https://www.youtube.com/watch?v=${id}${start > 0 ? `&t=${start}s` : ''}`;
