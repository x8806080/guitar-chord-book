import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Moon, Sun, PanelLeft, PenLine, Music4 } from 'lucide-react';

import Editor from './components/Editor.jsx';
import SongSheet from './components/SongSheet.jsx';
import SongList from './components/SongList.jsx';
import TransposeBar from './components/TransposeBar.jsx';

import { parseChordPro, collectChords } from './lib/chordpro.js';
import { detectKey, preferFlat } from './lib/chords.js';
import * as db from './lib/storage.js';
import { SAMPLE } from './lib/sample.js';

export default function App() {
  const [songs, setSongs] = useState(() => {
    const list = db.listSongs();
    if (list.length) return list;
    // 首次造訪塞一首範例，讓人立刻看到東西
    return db.saveSong(db.createSong({ title: 'Twinkle Twinkle Little Star', artist: '傳統民謠', source: SAMPLE }));
  });
  const [activeId, setActiveId] = useState(() => songs[0]?.id ?? null);
  const [prefs, setPrefsState] = useState(db.getPrefs);
  const [mobileView, setMobileView] = useState('sheet'); // list | edit | sheet
  const [sidebar, setSidebar] = useState(true);
  const [toast, setToast] = useState('');

  const active = useMemo(() => songs.find((s) => s.id === activeId) ?? null, [songs, activeId]);

  /* ---------- 解析與調性 ---------- */
  const ast = useMemo(() => parseChordPro(active?.source ?? ''), [active?.source]);
  const baseKey = useMemo(() => {
    const declared = ast.meta.key ? detectKey([ast.meta.key]) : null; // {key: Am} 優先
    return declared ?? detectKey(collectChords(ast));
  }, [ast]);

  const semitones = active?.semitones ?? 0;
  const useFlat = prefs.useFlat ?? (baseKey ? preferFlat(baseKey.root, baseKey.minor) : false);

  /* ---------- 主題 ---------- */
  useEffect(() => {
    document.documentElement.classList.toggle('dark', prefs.theme === 'dark');
    db.setPrefs(prefs);
  }, [prefs]);
  const setPrefs = (patch) => setPrefsState((p) => ({ ...p, ...patch }));

  /* ---------- 存檔（500ms debounce，避免每個按鍵都寫 localStorage） ---------- */
  const timer = useRef(null);
  const patchActive = useCallback((patch) => {
    setSongs((prev) => {
      const next = prev.map((s) => (s.id === activeId ? { ...s, ...patch } : s));
      const target = next.find((s) => s.id === activeId);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => db.saveSong(target), 500);
      return next;
    });
  }, [activeId]);

  // 歌名/歌手跟著 {title:} {artist:} 走，側欄才不會一直顯示「未命名」
  useEffect(() => {
    if (!active) return;
    const t = ast.meta.title || '未命名歌曲';
    const a = ast.meta.artist || ast.meta.subtitle || '';
    if (t !== active.title || a !== active.artist) patchActive({ title: t, artist: a });
  }, [ast.meta.title, ast.meta.artist, ast.meta.subtitle]); // eslint-disable-line

  /* ---------- 動作 ---------- */
  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2400); };

  const handleCreate = () => {
    const s = db.createSong({ source: '{title: 未命名歌曲}\n{artist: }\n\n[C]在這裡開始寫\n' });
    setSongs(db.saveSong(s));
    setActiveId(s.id);
    setMobileView('edit');
  };

  const handleDelete = (id) => {
    const s = songs.find((x) => x.id === id);
    if (!confirm(`刪除「${s?.title}」？這個動作無法復原。`)) return;
    const next = db.deleteSong(id);
    setSongs(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  };

  const handleImport = async (file) => {
    try {
      const { added, updated } = await db.importJSON(file, 'merge');
      const next = db.listSongs();
      setSongs(next);
      setActiveId((cur) => cur ?? next[0]?.id ?? null);
      notify(`已匯入：新增 ${added} 首、更新 ${updated} 首`);
    } catch (e) {
      notify(`匯入失敗：${e.message}`);
    }
  };

  /* ---------- 鍵盤快捷鍵 ---------- */
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === '+' || e.key === '=') patchActive({ semitones: Math.min(11, semitones + 1) });
      if (e.key === '-') patchActive({ semitones: Math.max(-11, semitones - 1) });
      if (e.key === '0') patchActive({ semitones: 0 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [semitones, patchActive]);

  const iconBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink hover:border-accent hover:text-accent';

  return (
    <div className="flex h-full flex-col bg-bg text-ink">
      {/* ---- 頂部工具列 ---- */}
      <header className="no-print flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <button
          className={`${iconBtn} hidden lg:inline-flex`}
          onClick={() => setSidebar((v) => !v)}
          title="顯示 / 隱藏歌曲清單"
        >
          <PanelLeft size={16} />
        </button>

        <div className="mr-1 flex items-center gap-2">
          <Music4 size={18} style={{ color: 'var(--chord)' }} />
          <span className="font-display text-[15px] font-bold tracking-tight">Chord Book</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {active && (
            <TransposeBar
              baseKey={baseKey}
              semitones={semitones}
              onChange={(v) => patchActive({ semitones: v })}
              useFlat={useFlat}
              onToggleFlat={() => setPrefs({ useFlat: !useFlat })}
              fontSize={prefs.fontSize}
              onFontSize={(v) => setPrefs({ fontSize: v })}
            />
          )}
          <button
            className={iconBtn}
            onClick={() => setPrefs({ theme: prefs.theme === 'dark' ? 'light' : 'dark' })}
            title="切換深色 / 淺色"
          >
            {prefs.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* ---- 主體 ---- */}
      <main className="flex min-h-0 flex-1">
        {/* 側欄：桌機常駐，手機切到「清單」分頁才出現 */}
        <aside
          className={`w-full shrink-0 border-r border-line bg-surface lg:w-72 ${
            sidebar ? 'lg:block' : 'lg:hidden'
          } ${mobileView === 'list' ? 'block' : 'hidden lg:block'}`}
        >
          <SongList
            songs={songs}
            activeId={activeId}
            onSelect={(id) => { setActiveId(id); setMobileView('sheet'); }}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onExport={db.exportJSON}
            onImport={handleImport}
          />
        </aside>

        {/* 編輯區：桌機佔左半，手機切到「編輯」分頁才出現 */}
        <section
          className={`min-h-0 w-full border-r border-line bg-surface lg:block lg:w-[42%] lg:max-w-[560px] ${
            mobileView === 'edit' ? 'block' : 'hidden'
          }`}
        >
          {active ? (
            <Editor value={active.source} onChange={(v) => patchActive({ source: v })} />
          ) : (
            <p className="p-6 text-muted">先在左邊選一首歌，或按 ＋ 新增。</p>
          )}
        </section>

        {/* 樂譜區 */}
        <section
          className={`min-h-0 w-full overflow-y-auto lg:block ${mobileView === 'sheet' ? 'block' : 'hidden'}`}
        >
          {active ? (
            <SongSheet ast={ast} semitones={semitones} useFlat={useFlat} fontSize={prefs.fontSize} />
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-muted">
              <p>還沒有選歌。按 ＋ 建一首新的，或匯入你的 JSON 備份。</p>
            </div>
          )}
        </section>
      </main>

      {/* ---- 手機底部分頁 ---- */}
      <nav className="no-print flex shrink-0 border-t border-line bg-surface lg:hidden">
        {[
          { id: 'list', label: '歌曲', icon: PanelLeft },
          { id: 'edit', label: '編輯', icon: PenLine },
          { id: 'sheet', label: '樂譜', icon: Music4 },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setMobileView(id)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]"
            style={{ color: mobileView === id ? 'var(--accent)' : 'var(--muted)' }}
            aria-current={mobileView === id}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>

      {toast && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-line px-4 py-2 text-[13px] shadow-lg lg:bottom-6"
          style={{ background: 'var(--surface-2)' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
