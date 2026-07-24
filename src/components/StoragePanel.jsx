import React, { useMemo, useState } from 'react';
import { X, HardDrive, Trash2, Download, AlertTriangle } from 'lucide-react';
import { storageUsage, purgeTombstones } from '../lib/storage.js';

const kb = (b) => (b / 1024).toFixed(1) + ' KB';
const mb = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';

/**
 * 儲存空間面板
 *
 * localStorage 通常只有 5MB，滿了就完全寫不進去 —— 而且症狀是
 * 「新增看起來成功、重新整理就消失」，非常難自己查。
 * 所以要能一眼看出是誰佔空間，並且就地清理。
 */
export default function StoragePanel({ onClose, onPurged, onExport }) {
  const [refresh, setRefresh] = useState(0);
  const u = useMemo(() => storageUsage(), [refresh]);

  // 瀏覽器一般給 5MB，這裡當作參考基準（沒有標準 API 可查實際上限）
  const LIMIT = 5 * 1024 * 1024;
  const pct = Math.min(100, (u.totalBytes / LIMIT) * 100);
  const tight = pct > 80;

  const doPurge = () => {
    if (!confirm(`清掉 ${u.tombstoneCount} 筆已刪除記錄，釋放約 ${kb(u.tombstoneBytes)}？\n\n注意：這些刪除紀錄清掉後，若其他裝置上還留著那些歌，下次同步可能會被拉回來。`)) return;
    purgeTombstones();
    setRefresh((v) => v + 1);
    onPurged?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-surface p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="儲存空間"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-[15px] font-bold">
            <HardDrive size={16} style={{ color: 'var(--chord)' }} /> 儲存空間
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="關閉"><X size={18} /></button>
        </div>

        {/* 用量條 */}
        <div className="mb-1 flex items-baseline justify-between text-[12px]">
          <span className="text-muted">已使用</span>
          <span className="font-chord font-bold" style={{ color: tight ? 'var(--danger)' : 'var(--chord)' }}>
            {mb(u.totalBytes)} / 約 5 MB
          </span>
        </div>
        <div className="mb-3 h-2 overflow-hidden rounded-full bg-surface2">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: tight ? 'var(--danger)' : 'var(--accent)' }}
          />
        </div>

        {tight && (
          <div className="mb-3 flex gap-2 rounded-lg border border-line p-2.5 text-[12px]" style={{ borderColor: 'var(--danger)' }}>
            <AlertTriangle size={15} className="shrink-0" style={{ color: 'var(--danger)' }} />
            <p>空間快滿了。滿了之後新增與編輯都存不進去，而且重新整理就會消失。建議先匯出備份，再刪掉用不到的歌譜。</p>
          </div>
        )}

        <dl className="mb-3 grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-lg bg-surface2 p-2">
            <dt className="text-muted">歌譜</dt>
            <dd className="font-chord text-[15px] font-bold">{u.songCount} 首</dd>
          </div>
          <div className="rounded-lg bg-surface2 p-2">
            <dt className="text-muted">已刪除記錄</dt>
            <dd className="font-chord text-[15px] font-bold">{u.tombstoneCount} 筆</dd>
          </div>
        </dl>

        {u.largestSongs.length > 0 && (
          <>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">佔最多空間的歌譜</h3>
            <ul className="mb-3 space-y-1">
              {u.largestSongs.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-lg bg-surface2 px-2.5 py-1.5 text-[12px]">
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <span className="ml-2 shrink-0 font-chord text-muted">{kb(s.bytes)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] hover:border-accent hover:text-accent"
          >
            <Download size={13} /> 先匯出備份
          </button>
          {u.tombstoneCount > 0 && (
            <button
              onClick={doPurge}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] hover:border-[var(--danger)] hover:text-[var(--danger)]"
            >
              <Trash2 size={13} /> 清掉已刪除記錄（{kb(u.tombstoneBytes)}）
            </button>
          )}
        </div>

        <p className="mt-3 text-[11px] text-muted">
          歌譜存在這個瀏覽器裡，上限由瀏覽器決定（多數約 5 MB）。設定雲端同步後，
          即使清掉本機資料也能從 GitHub 拉回來。
        </p>
      </div>
    </div>
  );
}
