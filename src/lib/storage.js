/**
 * storage.js — 本機資料存取層（Repository Pattern）
 *
 * 重要：刪除採「墓碑（tombstone）」而非真的移除。
 * 因為多裝置同步時，若 A 裝置把歌真的刪掉，下次跟 B 裝置合併，
 * B 那邊還在的那首會被當成「A 沒有的新歌」而復活。
 * 標記 deletedAt 才能讓「刪除」這個動作本身也參與合併。
 */

import { SYNC_DEFAULTS } from '../config.js';
import { getAllCustom, replaceAllCustom } from './customshapes.js';

const KEY = 'gcb.songs.v1';
const PREFS = 'gcb.prefs.v1';
const SYNC = 'gcb.sync.v1';
export const SCHEMA_VERSION = 1;

/** 墓碑保留天數，超過就真的清掉 */
const TOMBSTONE_DAYS = 30;

const uid = () =>
  crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** 儲存失敗時丟這個，讓呼叫端能明確告知使用者 */
export class StorageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StorageError';
  }
}

const read = (k, fallback) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

/**
 * 寫入。失敗時**必須拋錯**，不可以只印 console —— 否則畫面上東西還在、
 * localStorage 卻沒寫進去，使用者要等到重新整理才發現資料不見了。
 * 常見失敗原因：無痕模式、瀏覽器封鎖儲存、容量已滿。
 */
const isQuotaError = (e) =>
  /quota|exceeded/i.test(String(e?.name) + ' ' + String(e?.message));

const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch (e) {
    console.error('儲存失敗', e);
    throw new StorageError(
      isQuotaError(e)
        ? '瀏覽器儲存空間已滿，資料沒有存下來。請先匯出備份再刪掉一些歌譜。'
        : '無法寫入瀏覽器儲存空間，資料不會被保留。可能是無痕模式或瀏覽器設定封鎖了儲存。'
    );
  }
};

/**
 * 各項資料的佔用空間（診斷用）。
 * 容量滿的時候要能立刻看出是誰佔的，而不是叫使用者亂刪。
 */
export function storageUsage() {
  const items = [];
  let total = 0;
  try {
    for (const k of Object.keys(localStorage)) {
      const bytes = new Blob([localStorage.getItem(k) ?? '']).size;
      total += bytes;
      items.push({ key: k, bytes });
    }
  } catch { /* 讀不到就回空的，不要因為診斷而炸掉 */ }

  const songs = listAll();
  const live = songs.filter((s) => !s.deletedAt);
  const tombstones = songs.filter((s) => s.deletedAt);
  const sizeOf = (s) => new Blob([JSON.stringify(s)]).size;

  return {
    totalBytes: total,
    items: items.sort((a, b) => b.bytes - a.bytes),
    songCount: live.length,
    tombstoneCount: tombstones.length,
    tombstoneBytes: tombstones.reduce((n, s) => n + sizeOf(s), 0),
    largestSongs: live
      .map((s) => ({ id: s.id, title: s.title, bytes: sizeOf(s) }))
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 5),
  };
};

/**
 * 啟動檢查：確認 localStorage 真的可寫可讀。
 * 有些環境（無痕模式、隱私設定、iOS 低儲存空間）localStorage 存在但寫入無效，
 * 那會造成「新增的東西重新整理就消失」這種最難查的問題 —— 要及早明講。
 */
export function checkStorageWorks() {
  const probe = '__gcb_probe__';
  try {
    localStorage.setItem(probe, '1');
    const ok = localStorage.getItem(probe) === '1';
    localStorage.removeItem(probe);
    return ok;
  } catch {
    return false;
  }
}

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

/**
 * 立刻清掉所有墓碑（容量吃緊時用）。
 * 代價：這些刪除紀錄消失後，若其他裝置上還留著那些歌，下次同步可能被拉回來。
 */
export function purgeTombstones() {
  const kept = listAll().filter((s) => !s.deletedAt);
  write(KEY, kept);
  return kept;
}

export function saveSong(song) {
  const songs = listAll();
  const now = new Date().toISOString();
  const i = songs.findIndex((s) => s.id === song.id);
  // 尊重呼叫端已設好的 updatedAt（編輯當下就蓋了時間戳）；
  // 沒帶才補 now。若這裡強制用 now，會把「編輯瞬間」延後到「存檔瞬間」，
  // 與同步 pull 形成競態，導致剛編輯的內容被判定為舊而被覆蓋。
  const next = { ...song, updatedAt: song.updatedAt || now, createdAt: song.createdAt || now };
  if (i >= 0) songs[i] = next;
  else songs.unshift({ ...next, id: next.id || uid() });

  try {
    write(KEY, songs);
  } catch (e) {
    if (!(e instanceof StorageError)) throw e;
    // 容量滿時，已刪除的墓碑往往還佔著空間。先清掉全部墓碑再試一次，
    // 能救回來就不要打擾使用者。（墓碑清掉的代價：那些刪除可能在其他裝置復活）
    const purged = songs.filter((s) => !s.deletedAt);
    if (purged.length === songs.length) throw e;   // 沒墓碑可清，救不了
    write(KEY, purged);                            // 再失敗就讓它往上拋
    return purged;
  }
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
    customShapes: getAllCustom(),
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

  if (data.customShapes && typeof data.customShapes === 'object') {
    // 自訂指型一律合併（同 key 取較新），不隨 replace 模式整包覆蓋
    const { mergeCustom, getAllCustom: getAll } = await import('./customshapes.js');
    replaceAllCustom(mergeCustom(getAll(), data.customShapes));
  }
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
