import React, { useState } from 'react';
import { Plus, Trash2, Download, Upload, Search } from 'lucide-react';

export default function SongList({ songs, activeId, onSelect, onCreate, onDelete, onExport, onImport }) {
  const [q, setQ] = useState('');
  const filtered = songs.filter(
    (s) =>
      !q ||
      (s.title + ' ' + (s.artist || '')).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋歌名或歌手"
            className="w-full rounded-lg border border-line bg-surface py-1.5 pl-8 pr-2 text-[13px] outline-none placeholder:text-muted focus:border-accent"
          />
        </div>
        <button
          onClick={onCreate}
          title="新增歌曲"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          <Plus size={16} />
        </button>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {filtered.length === 0 && (
          <li className="px-3 py-8 text-center text-[13px] text-muted">
            {songs.length === 0 ? '還沒有歌譜。按 ＋ 開始第一首。' : '沒有符合的歌曲。'}
          </li>
        )}
        {filtered.map((s) => {
          const active = s.id === activeId;
          return (
            <li key={s.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(s.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(s.id)}
                className={`group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 ${
                  active ? 'bg-surface2' : 'hover:bg-surface2'
                }`}
              >
                <span
                  className="h-8 w-[3px] shrink-0 rounded-full"
                  style={{ background: active ? 'var(--chord)' : 'transparent' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{s.title}</span>
                  <span className="block truncate font-chord text-[11px] text-muted">
                    {s.artist || '—'}
                    {s.semitones ? ` · ${s.semitones > 0 ? '+' : ''}${s.semitones}` : ''}
                  </span>
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                  title="刪除這首"
                  className="shrink-0 text-muted opacity-0 transition-opacity hover:text-[var(--danger)] focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2 border-t border-line p-3">
        <button
          onClick={onExport}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-[12px] text-muted hover:border-accent hover:text-accent"
        >
          <Download size={13} /> 匯出備份
        </button>
        <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-[12px] text-muted hover:border-accent hover:text-accent">
          <Upload size={13} /> 匯入復原
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}
