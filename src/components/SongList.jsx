import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Download, Upload, Search, ChevronRight, List } from 'lucide-react';
import { groupByArtist, UNGROUPED } from '../lib/grouping.js';

const KEY = 'gcb.collapsed.v1';

const readCollapsed = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
};
const writeCollapsed = (set) => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch { /* 容量滿了也不該影響操作 */ }
};

export default function SongList({ songs, activeId, onSelect, onCreate, onDelete, onExport, onImport }) {
  const [q, setQ] = useState('');
  const [grouped, setGrouped] = useState(true);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const filtered = useMemo(
    () =>
      songs.filter(
        (s) => !q || (s.title + ' ' + (s.artist || '')).toLowerCase().includes(q.toLowerCase())
      ),
    [songs, q]
  );

  const groups = useMemo(() => groupByArtist(filtered), [filtered]);

  const toggle = (name) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      writeCollapsed(next);
      return next;
    });
  };

  // 搜尋時一律展開（不然搜到的東西藏在收折的組裡，等於搜了個寂寞）
  const isOpen = (name, songsInGroup) =>
    Boolean(q) || !collapsed.has(name) || songsInGroup.some((s) => s.id === activeId);

  const renderSong = (s) => {
    const active = s.id === activeId;
    const semi = s.semitones ? `${s.semitones > 0 ? '+' : ''}${s.semitones}` : null;
    // 分組時歌手已在組標題上，副標只留調性；平鋪時才需要顯示歌手
    const sub = grouped
      ? (semi ?? '原調')
      : [s.artist || '—', semi].filter(Boolean).join(' · ');
    return (
      <li key={s.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelect(s.id)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(s.id)}
          className={`group flex cursor-pointer items-center gap-2 rounded-lg py-2 pr-2 ${
            grouped ? 'pl-5' : 'pl-3'
          } ${active ? 'bg-surface2' : 'hover:bg-surface2'}`}
        >
          <span
            className="h-8 w-[3px] shrink-0 rounded-full"
            style={{ background: active ? 'var(--chord)' : 'transparent' }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">{s.title}</span>
            <span className="block truncate font-chord text-[11px] text-muted">{sub}</span>
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
            title="刪除這首"
            aria-label={`刪除 ${s.title}`}
            className="shrink-0 text-muted opacity-0 transition-opacity hover:text-[var(--danger)] focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </li>
    );
  };

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
          onClick={() => setGrouped((v) => !v)}
          title={grouped ? '改成平鋪清單' : '依歌手分組'}
          aria-pressed={grouped}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line hover:border-accent"
          style={{ color: grouped ? 'var(--chord)' : 'var(--muted)' }}
        >
          <List size={15} />
        </button>
        <button
          onClick={onCreate}
          title="新增歌曲"
          aria-label="新增歌曲"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {filtered.length === 0 && (
          <p className="px-3 py-8 text-center text-[13px] text-muted">
            {songs.length === 0 ? '還沒有歌譜。按 ＋ 開始第一首。' : '沒有符合的歌曲。'}
          </p>
        )}

        {!grouped && <ul>{filtered.map(renderSong)}</ul>}

        {grouped &&
          groups.map(([artist, list]) => {
            const open = isOpen(artist, list);
            return (
              <section key={artist} className="mb-0.5">
                <button
                  onClick={() => toggle(artist)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left hover:bg-surface2"
                >
                  <ChevronRight
                    size={13}
                    className={`shrink-0 text-muted transition-transform ${open ? 'rotate-90' : ''}`}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-[12px] font-semibold"
                    style={{ color: artist === UNGROUPED ? 'var(--muted)' : 'var(--text)' }}
                  >
                    {artist}
                  </span>
                  <span className="shrink-0 font-chord text-[10px] text-muted">{list.length}</span>
                </button>
                {open && <ul>{list.map(renderSong)}</ul>}
              </section>
            );
          })}
      </div>

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
