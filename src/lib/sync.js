/**
 * sync.js — GitHub Contents API 同步引擎
 *
 * 設計前提：GitHub Pages 是純靜態，沒有後端可以藏密鑰。
 * 因此 token 只能由使用者自己輸入、存在自己瀏覽器的 localStorage，
 * 絕對不可以寫進程式碼（一 commit 就會被 GitHub secret scanning 撤銷，而且全世界看得到）。
 *
 * 同步策略：每次都「先拉、再合、後推」（pull → merge → push）。
 * 合併是「逐首 last-write-wins」，不是整包覆蓋 —— 兩台裝置各自改不同的歌不會互相蓋掉。
 */

const API = 'https://api.github.com';

const headers = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
});

/* ---------- UTF-8 安全的 Base64（中文歌詞必須用這個，btoa 直接吃中文會炸） ---------- */

export function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CHUNK = 0x8000; // 一次太多會爆 call stack
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function fromBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, '')); // GitHub 回傳的 base64 帶換行
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ---------- 合併演算法（純函式，可測試） ---------- */

/** 這首歌最後一次被動到的時間（刪除也算一次異動） */
const stamp = (s) => {
  const u = s.updatedAt || s.createdAt || '';
  const d = s.deletedAt || '';
  return d > u ? d : u;
};

/**
 * 逐首合併：同一 id 取較新的那份；只有一邊有的直接納入。
 * 因為刪除是墓碑（帶 deletedAt），「刪除」也會正常贏過較舊的「編輯」。
 */
export function mergeSongs(local = [], remote = []) {
  const map = new Map();
  const put = (s) => {
    if (!s || !s.id) return;
    const prev = map.get(s.id);
    if (!prev || stamp(s) > stamp(prev)) map.set(s.id, s);
  };
  remote.forEach(put);
  local.forEach(put); // 同時間戳時本機優先（使用者剛剛才操作過）
  return [...map.values()].sort((a, b) => stamp(b).localeCompare(stamp(a)));
}

/** 兩份清單內容是否等價（決定要不要真的發 PUT，省 API 額度與 commit 數） */
export function sameSongs(a = [], b = []) {
  const norm = (list) =>
    JSON.stringify([...list].sort((x, y) => String(x.id).localeCompare(String(y.id))));
  return norm(a) === norm(b);
}

/* ---------- 錯誤轉譯 ---------- */

export class SyncError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function toError(res) {
  let detail = '';
  try {
    detail = (await res.json())?.message || '';
  } catch { /* 忽略非 JSON 回應 */ }

  switch (res.status) {
    case 401:
      return new SyncError('BAD_TOKEN', 'Token 無效或已過期。請重新產生一組並貼上。');
    case 403:
      return /rate limit/i.test(detail)
        ? new SyncError('RATE_LIMIT', 'GitHub API 次數用完了，等一小時再試。')
        : new SyncError('NO_PERMISSION', 'Token 權限不足。請確認 Contents 給了 Read and write。');
    case 404:
      return new SyncError('NOT_FOUND', '找不到 repo。可能是名稱打錯，或 token 沒把這個 repo 加進 Repository access。');
    case 409:
      return new SyncError('CONFLICT', '遠端剛被其他裝置改過，請再按一次同步。');
    case 422:
      return new SyncError('BAD_REQUEST', `GitHub 拒絕這次寫入：${detail}`);
    default:
      return new SyncError('HTTP_' + res.status, `GitHub 回應 ${res.status}：${detail}`);
  }
}

/* ---------- API ---------- */

/**
 * 驗證設定是否可用。
 * 刻意用 /repos/{owner}/{repo} 而不是 /user —— fine-grained token 只給了單一 repo 權限時，
 * 這支一定通得過，而且順便能檢查 repo 是不是 private。
 */
export async function checkRepo({ token, owner, repo }) {
  const res = await fetch(`${API}/repos/${owner}/${repo}`, { headers: headers(token) });
  if (!res.ok) throw await toError(res);
  const j = await res.json();
  return {
    private: j.private,
    defaultBranch: j.default_branch,
    canWrite: Boolean(j.permissions?.push),
    fullName: j.full_name,
  };
}

/** 拉遠端；檔案還不存在時回傳空清單（第一次同步的正常狀況） */
export async function pullRemote({ token, owner, repo, path, branch }) {
  const url = `${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}&t=${Date.now()}`;
  const res = await fetch(url, { headers: headers(token), cache: 'no-store' });

  if (res.status === 404) return { songs: [], customShapes: {}, sha: null, firstTime: true };
  if (!res.ok) throw await toError(res);

  const j = await res.json();
  try {
    const data = JSON.parse(fromBase64(j.content));
    return {
      songs: Array.isArray(data) ? data : data.songs ?? [],
      customShapes: (!Array.isArray(data) && data.customShapes) || {},
      sha: j.sha, firstTime: false,
    };
  } catch {
    throw new SyncError('BAD_JSON', `遠端的 ${path} 不是合法 JSON，請手動檢查或刪掉重來。`);
  }
}

/** 推遠端；sha 是「我看到的版本」，GitHub 用它做樂觀鎖，不符會回 409 */
export async function pushRemote({ token, owner, repo, path, branch }, songs, sha, extra = {}) {
  const payload = {
    schema: 1,
    updatedAt: new Date().toISOString(),
    songs,
    ...extra,
  };
  const body = {
    message: `chore(sync): ${songs.filter((s) => !s.deletedAt).length} songs @ ${new Date().toISOString()}`,
    content: toBase64(JSON.stringify(payload, null, 2)),
    branch,
  };
  if (sha) body.sha = sha; // 沒有 sha = 建立新檔

  const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toError(res);
  const j = await res.json();
  return j.content.sha;
}

/**
 * 完整一次同步：pull → merge → push（沒變化就不 push）
 * @returns {{songs, sha, pushed, pulled, firstTime}}
 */
export async function syncNow(cfg, localSongs, localCustom = {}) {
  const raw = await pullRemote(cfg);
  const { songs: remote, sha, firstTime } = raw;
  const remoteCustom = raw.customShapes || {};
  const merged = mergeSongs(localSongs, remote);
  const mergedCustom = mergeCustomShapes(localCustom, remoteCustom);

  const pulled = !sameSongs(merged, localSongs) || !sameCustom(mergedCustom, localCustom);
  const pushed = !sameSongs(merged, remote) || !sameCustom(mergedCustom, remoteCustom);

  let newSha = sha;
  if (pushed) newSha = await pushRemote(cfg, merged, sha, { customShapes: mergedCustom });

  return { songs: merged, custom: mergedCustom, sha: newSha, pushed, pulled, firstTime };
}

/** 自訂指型合併：同 key 取較新（跟歌譜同一套 last-write-wins） */
export function mergeCustomShapes(local = {}, remote = {}) {
  const out = { ...remote };
  for (const [k, v] of Object.entries(local || {})) {
    if (!out[k] || (v?.updatedAt || '') >= (out[k]?.updatedAt || '')) out[k] = v;
  }
  return out;
}

const sameCustom = (a = {}, b = {}) => JSON.stringify(a) === JSON.stringify(b);
