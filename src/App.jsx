import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Moon, Sun, PanelLeft, PenLine, Music4, Cloud, CloudOff, RefreshCw, CloudAlert, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import Editor from './components/Editor.jsx';
import SongSheet from './components/SongSheet.jsx';
import SongList from './components/SongList.jsx';
import TransposeBar from './components/TransposeBar.jsx';
import SyncSettings from './components/SyncSettings.jsx';
import ScrollControl from './components/ScrollControl.jsx';

import { parseChordPro, collectChords } from './lib/chordpro.js';
import { detectKey, preferFlat } from './lib/chords.js';
import * as db from './lib/storage.js';
import * as custom from './lib/customshapes.js';
import { syncNow } from './lib/sync.js';
import { useAutoScroll, snapSpeed, scrollToTop, SPEED_DEFAULT } from './lib/autoscroll.js';
import { VERSION, formatVersion } from './lib/version.js';
import { SAMPLE } from './lib/sample.js';

export default function App() {
  const [songs, setSongs] = useState(() => {
    const list = db.listAll();
    if (list.length) return list;
    // 首次造訪塞一首範例，讓人立刻看到東西
    return db.saveSong(db.createSong({ title: 'Twinkle Twinkle Little Star', artist: '傳統民謠', source: SAMPLE }));
  });
  const visible = useMemo(() => songs.filter((s) => !s.deletedAt), [songs]);
  const [activeId, setActiveId] = useState(() => visible[0]?.id ?? null);

  const [syncCfg, setSyncCfg] = useState(db.getSyncConfig);
  const [syncOpen, setSyncOpen] = useState(false);
  const [highlight, setHighlight] = useState(null); // 樂譜上選到的和弦/歌詞，對應原始碼的範圍
  const [customVer, setCustomVer] = useState(0);     // 自訂指型改一次就 +1，觸發和弦圖重算

  const handleCustomChange = useCallback((action, name, shape) => {
    if (action === 'save') custom.saveCustomShape(name, shape);
    if (action === 'delete') custom.deleteCustomShape(name);
    setCustomVer((v) => v + 1);
    notify(action === 'delete' ? '已刪除自訂指型' : `已儲存 ${name} 的自訂指型`);
  }, []);
  const [syncState, setSyncState] = useState('idle'); // idle | busy | ok | error | off
  const [prefs, setPrefsState] = useState(db.getPrefs);
  const [mobileView, setMobileView] = useState('sheet'); // list | edit | sheet
  const [sidebar, setSidebar] = useState(true);
  const mainRef = useRef(null);
  const [toast, setToast] = useState('');

  const active = useMemo(() => visible.find((s) => s.id === activeId) ?? null, [visible, activeId]);

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

  /* ---------- 動作 ---------- */
  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  /* ---------- GitHub 同步 ---------- */
  // 注意：runSync / scheduleSync 必須定義在 patchActive「之前」。
  // const 有暫時性死區（TDZ），useCallback 的依賴陣列是定義當下就求值的，
  // 若順序顛倒會在啟動瞬間丟 ReferenceError，整個 App 白/黑畫面。
  const syncing = useRef(false);

  const runSync = useCallback(async (silent = false) => {
    const cfg = db.getSyncConfig();
    if (!db.isSyncReady(cfg)) { setSyncState('off'); return; }
    if (syncing.current) return;              // 避免自動與手動同時觸發打架
    syncing.current = true;
    setSyncState('busy');
    try {
      const local = db.listAll();
      const r = await syncNow(cfg, local, custom.getAllCustom());
      const saved = db.replaceAll(r.songs);
      // 同步是非同步的：pull 花的那 1~3 秒裡，使用者可能還在打字。
      // 直接 setSongs(saved) 會用同步當下的快照蓋掉「這期間新打的字」，
      // 游標跳走、內容跳回。所以逐首比對 updatedAt，較新的那份（多半是正在編輯的）留住。
      setSongs((live) => saved.map((s) => {
        const cur = live.find((x) => x.id === s.id);
        return cur && (cur.updatedAt || '') > (s.updatedAt || '') ? cur : s;
      }));
      if (r.custom) { custom.replaceAllCustom(r.custom); setCustomVer((v) => v + 1); }
      const next = { ...cfg, sha: r.sha, lastSync: new Date().toISOString() };
      db.setSyncConfig(next);
      setSyncCfg(next);
      setSyncState('ok');
      if (!silent) {
        notify(r.firstTime ? '已建立雲端檔案，這台裝置的歌譜已上傳' :
               r.pulled && r.pushed ? '已同步（雙向合併）' :
               r.pushed ? '已上傳變更' :
               r.pulled ? '已拉下其他裝置的變更' : '已是最新，沒有變更');
      }
    } catch (e) {
      setSyncState('error');
      notify(`同步失敗：${e.message}`);
      console.error(e);
    } finally {
      syncing.current = false;
    }
  }, []);

  // 改完東西 8 秒後自動上傳（打字中不會一直打 API）
  const syncTimer = useRef(null);
  const scheduleSync = useCallback(() => {
    if (!db.isSyncReady(db.getSyncConfig())) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => runSync(true), 8000);
  }, [runSync]);

  /* ---------- 存檔（500ms debounce，避免每個按鍵都寫 localStorage） ---------- */
  const timer = useRef(null);
  const patchActive = useCallback((patch) => {
    // 關鍵：改畫面的同時就更新 updatedAt。
    // 若等到 500ms 後才由 saveSong 補上時間戳，這中間若有一次同步 pull 回來，
    // merge 會覺得「正在編輯的這首」比遠端舊，用舊資料蓋掉你剛打的字 ——
    // 症狀就是「打到一半跳回舊內容，要重打好幾次」。
    const stampedPatch = { ...patch, updatedAt: new Date().toISOString() };
    setSongs((prev) => {
      const next = prev.map((s) => (s.id === activeId ? { ...s, ...stampedPatch } : s));
      const target = next.find((s) => s.id === activeId);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { db.saveSong(target); scheduleSync(); }, 500);
      return next;
    });
  }, [activeId, scheduleSync]);

  /* ---------- 編輯窗格寬度（可拖曳、可收折） ---------- */
  const EDITOR_MIN = 18;
  const EDITOR_MAX = 70;
  const editorWidth = Math.min(EDITOR_MAX, Math.max(EDITOR_MIN, prefs.editorWidth ?? 42));
  const editorOpen = prefs.editorOpen !== false;
  const dragging = useRef(false);

  const onDragStart = (e) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onDragMove = (e) => {
    if (!dragging.current || !mainRef.current) return;
    const rect = mainRef.current.getBoundingClientRect();
    // 用百分比而非像素，換螢幕尺寸時比例才不會跑掉
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setPrefs({ editorWidth: Math.min(EDITOR_MAX, Math.max(EDITOR_MIN, pct)) });
  };
  const onDragEnd = (e) => {
    dragging.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  /* ---------- 自動捲動 ---------- */
  const sheetRef = useRef(null);
  const scrollSpeed = snapSpeed(active?.scrollSpeed ?? SPEED_DEFAULT);
  const { playing, toggle, stop, backToTop, canScroll } = useAutoScroll(sheetRef, scrollSpeed);

  // 換歌就停下來，免得新歌自己捲起來
  useEffect(() => { stop(); scrollToTop(sheetRef.current, false); setHighlight(null); }, [activeId, stop]);

  // 歌名/歌手跟著 {title:} {artist:} 走，側欄才不會一直顯示「未命名」
  useEffect(() => {
    if (!active) return;
    const t = ast.meta.title || '未命名歌曲';
    const a = ast.meta.artist || ast.meta.subtitle || '';
    if (t !== active.title || a !== active.artist) patchActive({ title: t, artist: a });
  }, [ast.meta.title, ast.meta.artist, ast.meta.subtitle]); // eslint-disable-line

  // 開啟 App 時先拉一次
  useEffect(() => {
    if (db.isSyncReady(db.getSyncConfig())) runSync(true);
    else setSyncState('off');
  }, []); // eslint-disable-line

  // 分頁重新可見時拉一次（手機切回來就是最新的）
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') runSync(true); };
    window.addEventListener('visibilitychange', onVis);
    return () => window.removeEventListener('visibilitychange', onVis);
  }, [runSync]);

  const handleCreate = () => {
    const s = db.createSong({ source: '{title: 未命名歌曲}\n{artist: }\n\n[C]在這裡開始寫\n' });
    setSongs(db.saveSong(s));
    setActiveId(s.id);
    setMobileView('edit');
    scheduleSync();
  };

  const handleDelete = (id) => {
    const s = songs.find((x) => x.id === id);
    if (!confirm(`刪除「${s?.title}」？這個動作無法復原。`)) return;
    const next = db.deleteSong(id);
    setSongs(next);
    if (activeId === id) setActiveId(next.find((x) => !x.deletedAt)?.id ?? null);
    scheduleSync();
  };

  const handleImport = async (file) => {
    try {
      const { added, updated } = await db.importJSON(file, 'merge');
      const next = db.listAll();
      setSongs(next);
      setActiveId((cur) => cur ?? next.find((x) => !x.deletedAt)?.id ?? null);
      notify(`已匯入：新增 ${added} 首、更新 ${updated} 首`);
      scheduleSync();
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
      if (e.key === ' ') { e.preventDefault(); toggle(); } // 空白鍵 = 播放/暫停
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [semitones, patchActive, toggle]);

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

        <button
          className={`${iconBtn} hidden lg:inline-flex`}
          onClick={() => setPrefs({ editorOpen: !editorOpen })}
          title={editorOpen ? '收起編輯器' : '展開編輯器'}
          aria-pressed={editorOpen}
        >
          {editorOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>

        <div className="mr-1 flex items-baseline gap-2">
          <span className="font-display text-[15px] font-bold tracking-tight">Chord Book</span>
          <span
            className="font-chord text-[10px] text-muted"
            title={`修改版次 ${formatVersion(VERSION)}`}
          >
            {VERSION}
          </span>
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
              showChords={prefs.showChords !== false}
              onToggleChords={() => setPrefs({ showChords: prefs.showChords === false })}
              editable={prefs.sheetEditable === true}
              onToggleEditable={() => setPrefs({ sheetEditable: prefs.sheetEditable !== true })}
            />
          )}
          <button
            className={iconBtn}
            onClick={() => (syncState === 'off' ? setSyncOpen(true) : runSync(false))}
            onContextMenu={(e) => { e.preventDefault(); setSyncOpen(true); }}
            title={
              syncState === 'off' ? '設定裝置同步'
              : syncState === 'busy' ? '同步中…'
              : syncState === 'error' ? '同步失敗，點一下重試'
              : syncCfg.lastSync ? `上次同步 ${new Date(syncCfg.lastSync).toLocaleTimeString('zh-TW')}（點一下立即同步、右鍵開設定）` : '點一下立即同步'
            }
            style={{ color: syncState === 'error' ? 'var(--danger)' : syncState === 'ok' ? 'var(--accent)' : undefined }}
            aria-label="裝置同步"
          >
            {syncState === 'busy' ? <RefreshCw size={16} className="animate-spin" />
              : syncState === 'off' ? <CloudOff size={16} />
              : syncState === 'error' ? <CloudAlert size={16} />
              : <Cloud size={16} />}
          </button>

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
      <main ref={mainRef} className="flex min-h-0 flex-1">
        {/* 側欄：桌機常駐，手機切到「清單」分頁才出現 */}
        <aside
          className={`w-full shrink-0 border-r border-line bg-surface lg:w-72 ${
            sidebar ? 'lg:block' : 'lg:hidden'
          } ${mobileView === 'list' ? 'block' : 'hidden lg:block'}`}
        >
          <SongList
            songs={visible}
            activeId={activeId}
            onSelect={(id) => { setActiveId(id); setMobileView('sheet'); }}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onExport={db.exportJSON}
            onImport={handleImport}
          />
        </aside>

        {/* 編輯區：桌機寬度可拖曳、可收折；手機切到「編輯」分頁才出現 */}
        <section
          className={`min-h-0 w-full bg-surface ${mobileView === 'edit' ? 'block' : 'hidden'} ${
            editorOpen ? 'lg:block' : 'lg:hidden'
          }`}
          style={{ flex: `0 0 ${editorWidth}%` }}
        >
          {active ? (
            <Editor value={active.source} onChange={(v) => patchActive({ source: v })} highlight={highlight} />
          ) : (
            <p className="p-6 text-muted">先在左邊選一首歌，或按 ＋ 新增。</p>
          )}
        </section>

        {/* 拖曳分隔線：只有桌機需要，手機是分頁切換 */}
        {editorOpen && (
          <div
            role="separator"
            aria-label="調整編輯器寬度"
            aria-orientation="vertical"
            aria-valuenow={Math.round(editorWidth)}
            aria-valuemin={EDITOR_MIN}
            aria-valuemax={EDITOR_MAX}
            tabIndex={0}
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            onDoubleClick={() => setPrefs({ editorWidth: 42 })}
            onKeyDown={(e) => {
              // 鍵盤也要能調（拖曳對某些人來說很難操作）
              if (e.key === 'ArrowLeft') setPrefs({ editorWidth: Math.max(EDITOR_MIN, editorWidth - 2) });
              if (e.key === 'ArrowRight') setPrefs({ editorWidth: Math.min(EDITOR_MAX, editorWidth + 2) });
            }}
            title="拖曳調整寬度，雙擊還原"
            className="no-print group relative hidden w-[5px] shrink-0 cursor-col-resize touch-none border-x border-line bg-surface lg:block"
          >
            <span className="pointer-events-none absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  style={{ background: 'var(--accent)' }} />
          </div>
        )}

        {/* 樂譜區 */}
        <div className={`relative min-h-0 w-full flex-1 lg:block ${mobileView === 'sheet' ? 'block' : 'hidden'}`}>
          <section ref={sheetRef} className="h-full overflow-y-auto">
            {active ? (
              <SongSheet
                ast={ast}
                semitones={semitones}
                useFlat={useFlat}
                fontSize={prefs.fontSize}
                showChords={prefs.showChords !== false}
                editable={prefs.sheetEditable === true}
                onSourceChange={(v) => patchActive({ source: v })}
                onHighlight={setHighlight}
                onCustomChange={handleCustomChange}
                customVersion={customVer}
              />
            ) : (
              <div className="grid h-full place-items-center px-6 text-center text-muted">
                <p>還沒有選歌。按 ＋ 建一首新的，或匯入你的 JSON 備份。</p>
              </div>
            )}
          </section>

          <ScrollControl
            visible={Boolean(active) && canScroll}
            playing={playing}
            onToggle={toggle}
            speed={scrollSpeed}
            onSpeed={(v) => patchActive({ scrollSpeed: v })}
            onTop={backToTop}
          />
        </div>
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

      {syncOpen && (
        <SyncSettings
          config={syncCfg}
          status={syncCfg}
          onClose={() => setSyncOpen(false)}
          onSave={(c) => {
            db.setSyncConfig(c);
            setSyncCfg(c);
            setSyncOpen(false);
            notify('設定已存到這台裝置，開始同步…');
            runSync(false);
          }}
          onClear={() => {
            if (!confirm('要從這台裝置移除 token 嗎？歌譜會留著，但不再同步。')) return;
            db.clearSyncConfig();
            setSyncCfg(db.getSyncConfig());
            setSyncState('off');
            setSyncOpen(false);
            notify('已移除 token。建議順手去 GitHub 把它 revoke 掉。');
          }}
          onSyncNow={() => { setSyncOpen(false); runSync(false); }}
        />
      )}

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
