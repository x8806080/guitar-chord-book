/**
 * storage.js — 資料存取層（Repository Pattern）
 * 目前實作：LocalStorage。
 * 未來要接 Firebase / Supabase，只要換掉這個檔案的實作、保持同樣介面即可，
 * 上層 React 元件完全不用改。
 */

const KEY = 'gcb.songs.v1';
const PREFS = 'gcb.prefs.v1';
export const SCHEMA_VERSION = 1;

const uid = () =>
  (crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

const read = (k, fallback) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch (e) {
    console.error('儲存失敗（可能已超出瀏覽器容量）', e);
    return false;
  }
};

export const listSongs = () => read(KEY, []);

export function saveSong(song) {
  const songs = listSongs();
  const now = new Date().toISOString();
  const i = songs.findIndex((s) => s.id === song.id);
  const next = { ...song, updatedAt: now, createdAt: song.createdAt || now };
  if (i >= 0) songs[i] = next;
  else songs.unshift({ ...next, id: next.id || uid() });
  write(KEY, songs);
  return songs;
}

export function createSong(partial = {}) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    title: partial.title || '未命名歌曲',
    artist: partial.artist || '',
    source: partial.source ?? '',
    semitones: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function deleteSong(id) {
  const songs = listSongs().filter((s) => s.id !== id);
  write(KEY, songs);
  return songs;
}

export const getPrefs = () => read(PREFS, { theme: 'dark', fontSize: 18, useFlat: false });
export const setPrefs = (p) => write(PREFS, p);

/* ---------- 備份 / 復原 ---------- */

export function exportJSON() {
  const payload = {
    schema: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    songs: listSongs(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chordbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 匯入 JSON。mode: 'merge'（依 id 覆蓋並保留其他）| 'replace'（整包取代）
 * @returns {{added:number, updated:number}}
 */
export async function importJSON(file, mode = 'merge') {
  const text = await file.text();
  const data = JSON.parse(text);
  const incoming = Array.isArray(data) ? data : data.songs;
  if (!Array.isArray(incoming)) throw new Error('檔案格式不符：找不到 songs 陣列');

  if (mode === 'replace') {
    write(KEY, incoming);
    return { added: incoming.length, updated: 0 };
  }
  const songs = listSongs();
  let added = 0, updated = 0;
  for (const s of incoming) {
    if (!s || typeof s.source !== 'string') continue;
    const i = songs.findIndex((x) => x.id === s.id);
    if (i >= 0) { songs[i] = s; updated++; }
    else { songs.push({ ...s, id: s.id || uid() }); added++; }
  }
  write(KEY, songs);
  return { added, updated };
}
