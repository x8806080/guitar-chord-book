/**
 * storage.js — 本機資料存取層（Repository Pattern）
 *
 * 重要：刪除採「墓碑（tombstone）」而非真的移除。
 * 因為多裝置同步時，若 A 裝置把歌真的刪掉，下次跟 B 裝置合併，
 * B 那邊還在的那首會被當成「A 沒有的新歌」而復活。
 * 標記 deletedAt 才能讓「刪除」這個動作本身也參與合併。
 */

import { SYNC_DEFAULTS } from '../config.js';

const KEY = 'gcb.songs.v1';
const PREFS = 'gcb.prefs.v1';
const SYNC = 'gcb.sync.v1';
export const SCHEMA_VERSION = 1;

/** 墓碑保留天數，超過就真的清掉 */
const TOMBSTONE_DAYS = 30;

const uid = () =>
  crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

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

/** 含墓碑的完整清單（給同步用） */
export const listAll = () => read(KEY, []);

/** 畫面用：不含已刪除 */
export const listSongs = () => listAll().filter((s) => !s.deletedAt);

/** 整包覆寫（同步合併後呼叫） */
export function replaceAll(songs) {
  write(KEY, gcTombstones(songs));
  return listAll();
}

/** 清掉過期墓碑 */
export function gcTombstones(songs) {
  const cutoff = new Date(Date.now() - TOMBSTONE_DAYS * 86400000).toISOString();
  return songs.filter((s) => !(s.deletedAt && s.deletedAt < cutoff));
}

export function saveSong(song) {
  const songs = listAll();
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

/** 刪除 = 立墓碑，內容清空以免佔空間 */
export function deleteSong(id) {
  const now = new Date().toISOString();
  const songs = listAll().map((s) =>
    s.id === id ? { ...s, source: '', deletedAt: now, updatedAt: now } : s
  );
  write(KEY, songs);
  return songs;
}

export const getPrefs = () => read(PREFS, { theme: 'dark', fontSize: 18, useFlat: false });
export const setPrefs = (p) => write(PREFS, p);

/* ---------- 同步設定（含 token，只存在這台裝置） ---------- */

/**
 * 同步設定。owner/repo/path/branch 一律用 config.js 的預設值帶入，
 * 使用者只需要貼 token。存過的值優先（讓進階使用者能改）。
 */
export const getSyncConfig = () => {
  const s = read(SYNC, {});
  return {
    token: s.token || '',
    owner: s.owner || SYNC_DEFAULTS.owner,
    repo: s.repo || SYNC_DEFAULTS.repo,
    path: s.path || SYNC_DEFAULTS.path,
    branch: s.branch || SYNC_DEFAULTS.branch,
    sha: s.sha ?? null,
    lastSync: s.lastSync ?? null,
  };
};
export const setSyncConfig = (c) => write(SYNC, c);
export const clearSyncConfig = () => localStorage.removeItem(SYNC);
export const isSyncReady = (c) => Boolean(c?.token && c?.owner && c?.repo && c?.path);

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

export async function importJSON(file, mode = 'merge') {
  const text = await file.text();
  const data = JSON.parse(text);
  const incoming = Array.isArray(data) ? data : data.songs;
  if (!Array.isArray(incoming)) throw new Error('檔案格式不符：找不到 songs 陣列');

  if (mode === 'replace') {
    write(KEY, incoming);
    return { added: incoming.length, updated: 0 };
  }
  const songs = listAll();
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
