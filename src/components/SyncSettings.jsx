import React, { useState } from 'react';
import { X, Eye, EyeOff, CheckCircle2, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { checkRepo } from '../lib/sync.js';

const field =
  'w-full rounded-lg border border-line bg-bg px-3 py-2 text-[13px] outline-none focus:border-accent';
const label = 'mb-1 block text-[12px] font-medium text-muted';

export default function SyncSettings({ config, onSave, onClear, onSyncNow, onClose, status }) {
  const [c, setC] = useState(config);
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null); // {ok, msg, warn}

  const set = (k, v) => setC((p) => ({ ...p, [k]: v }));

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const info = await checkRepo(c);
      if (!info.canWrite) {
        setResult({ ok: false, msg: '連得上，但這組 token 沒有寫入權限。Contents 要選 Read and write。' });
      } else if (!info.private) {
        setResult({
          ok: true,
          warn: true,
          msg: `連線成功（${info.fullName}），但這個 repo 是 Public —— 你的歌詞會公開在網路上。強烈建議改成 Private。`,
        });
      } else {
        setResult({ ok: true, msg: `連線成功：${info.fullName}（Private）。預設分支 ${info.defaultBranch}。` });
        if (info.defaultBranch !== c.branch) set('branch', info.defaultBranch);
      }
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    onSave({ ...c, token: c.token.trim(), owner: c.owner.trim(), repo: c.repo.trim() });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="裝置同步設定"
      >
        <header className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-5 py-3">
          <h2 className="font-display text-[15px] font-bold">裝置同步</h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="關閉">
            <X size={18} />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <p className="rounded-lg border border-line bg-surface2 p-3 text-[12px] leading-relaxed text-muted">
            歌譜會存成一個 JSON 檔放在你自己的 <strong className="text-ink">Private</strong> repo。
            Token 只留在這台裝置的瀏覽器，不會上傳、不會進程式碼。
            每台裝置各自輸入一次。
          </p>

          <div>
            <label className={label} htmlFor="tok">GitHub Token（fine-grained）</label>
            <div className="flex gap-2">
              <input
                id="tok"
                type={show ? 'text' : 'password'}
                value={c.token}
                onChange={(e) => set('token', e.target.value)}
                placeholder="github_pat_..."
                autoComplete="off"
                spellCheck={false}
                className={`${field} font-chord`}
              />
              <button
                onClick={() => setShow((v) => !v)}
                className="shrink-0 rounded-lg border border-line px-3 text-muted hover:text-accent"
                aria-label={show ? '隱藏 token' : '顯示 token'}
              >
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="own">帳號 / 組織</label>
              <input id="own" value={c.owner} onChange={(e) => set('owner', e.target.value)} placeholder="x8806080" className={`${field} font-chord`} />
            </div>
            <div>
              <label className={label} htmlFor="rep">Repo 名稱</label>
              <input id="rep" value={c.repo} onChange={(e) => set('repo', e.target.value)} placeholder="chordbook-data" className={`${field} font-chord`} />
            </div>
            <div>
              <label className={label} htmlFor="pth">檔案路徑</label>
              <input id="pth" value={c.path} onChange={(e) => set('path', e.target.value)} placeholder="songs.json" className={`${field} font-chord`} />
            </div>
            <div>
              <label className={label} htmlFor="brc">分支</label>
              <input id="brc" value={c.branch} onChange={(e) => set('branch', e.target.value)} placeholder="main" className={`${field} font-chord`} />
            </div>
          </div>

          {result && (
            <p
              className={`flex items-start gap-2 rounded-lg border p-3 text-[12px] leading-relaxed ${
                result.ok && !result.warn ? 'border-accent text-accent' : 'border-[var(--danger)] text-[var(--danger)]'
              }`}
            >
              {result.ok && !result.warn ? <CheckCircle2 size={15} className="mt-px shrink-0" /> : <AlertTriangle size={15} className="mt-px shrink-0" />}
              <span>{result.msg}</span>
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={test}
              disabled={testing || !c.token || !c.owner || !c.repo}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-[13px] hover:border-accent hover:text-accent disabled:opacity-40"
            >
              {testing && <Loader2 size={14} className="animate-spin" />}
              測試連線
            </button>
            <button
              onClick={save}
              disabled={!c.token || !c.owner || !c.repo}
              className="flex-1 rounded-lg py-2 text-[13px] font-medium disabled:opacity-40"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              儲存設定
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-line pt-4">
            <span className="text-[12px] text-muted">
              {status?.lastSync ? `上次同步 ${new Date(status.lastSync).toLocaleString('zh-TW')}` : '尚未同步過'}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClear}
                className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-[var(--danger)]"
                title="從這台裝置移除 token"
              >
                <Trash2 size={13} /> 移除 token
              </button>
              <button
                onClick={onSyncNow}
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] hover:border-accent hover:text-accent"
              >
                立即同步
              </button>
            </div>
          </div>

          <details className="text-[12px] text-muted">
            <summary className="cursor-pointer select-none hover:text-ink">怎麼拿 Token？（點開）</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4 leading-relaxed">
              <li>GitHub → 頭像 → Settings → Developer settings</li>
              <li>Personal access tokens → <strong>Fine-grained tokens</strong> → Generate new token</li>
              <li>Repository access → <strong>Only select repositories</strong> → 選你的資料 repo</li>
              <li>Permissions → Repository permissions → <strong>Contents</strong> → <strong>Read and write</strong></li>
              <li>Generate → 立刻複製（離開頁面就看不到了）</li>
            </ol>
          </details>
        </div>
      </div>
    </div>
  );
}
