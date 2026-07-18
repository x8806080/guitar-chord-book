import React, { useEffect, useMemo, useRef, useState } from 'react';
import { pairsToUnits, collectChords } from '../lib/chordpro.js';
import { transposeChordToken, transposeChord, isChord } from '../lib/chords.js';
import { ChordCard } from './ChordDiagram.jsx';
import ChordEditor from './ChordEditor.jsx';
import LyricEditor from './LyricEditor.jsx';
import LineControls from './LineControls.jsx';
import { replaceChord, removeChord, moveChord, moveChordTo, insertChord, replaceText, insertText, deleteBefore, breakLine, toSourceChord } from '../lib/chordedit.js';
import VideoPlayer from './VideoPlayer.jsx';
import { parseYouTube } from '../lib/youtube.js';

/**
 * 樂譜渲染
 * 排版核心：每個「單字」是一個 flex item（.sheet-unit），
 * 內含上排和弦 + 下排歌詞。換行只發生在 item 之間 →
 * 任何寬度下和弦都精準壓在該字正上方，不會跑版。
 */
function Line({ pairs, semitones, useFlat, editable, sel, onSelect, onEdit, drag, dropPos }) {
  const units = useMemo(() => pairsToUnits(pairs), [pairs]);
  // 解鎖時即使整行沒和弦也要留出和弦列，否則沒地方按「＋」加第一個和弦
  const showRow = units.some((u) => u.chord) || editable;

  // 這一行在原始碼裡的結尾位置（最後一個單元的文字結尾）
  const lastUnit = units[units.length - 1];
  const lineEnd = (lastUnit?.textStart ?? 0) + (lastUnit?.text?.length ?? 0);

  return (
    <div className="sheet-line group/line">
      {units.map((u, i) => {
        const shown = u.chord ? transposeChordToken(u.chord, semitones, useFlat) : null;
        const editing = editable && sel?.mode === 'edit' && u.chordStart != null && sel.start === u.chordStart;
        const inserting = editable && sel?.mode === 'insert' && sel.pos === u.textStart;
        const editingLyric = editable && sel?.mode === 'lyric' && sel.start === u.textStart;
        const isDragging = drag?.start === u.chordStart;
        const isDropTarget = dropPos != null && dropPos === u.textStart;

        return (
          <span
            className="sheet-unit relative"
            // 不可以用 index 當 key：搬動和弦會改變 units 的數量與順序
            // （"little" 會被切成 "l" + "ittle"），index 一錯位，
            // React 就會把編輯中的輸入框接到別的字上，畫面直接消失。
            key={`${u.textStart}:${u.chordStart ?? ''}`}
            data-pos={u.textStart}
          >
            {/* 拖曳時的落點指示線 */}
            {isDropTarget && (
              <span
                className="pointer-events-none absolute inset-y-0 left-0 w-[2px] rounded-full"
                style={{ background: 'var(--accent)' }}
              />
            )}
            {showRow &&
              (editing ? (
                <ChordEditor
                  value={sel.shown}
                  hint={sel.hint}
                  onCommit={(v) => onEdit({ type: 'replace', start: sel.start, end: sel.end, value: v })}
                  onMove={(d) => onEdit({ type: 'move', start: sel.start, end: sel.end, dir: d })}
                  onDelete={() => onEdit({ type: 'delete', start: sel.start, end: sel.end })}
                  onClose={() => onSelect(null)}
                />
              ) : inserting ? (
                <ChordEditor
                  value=""
                  canMove={false}
                  onCommit={(v) => onEdit({ type: 'insert', pos: sel.pos, value: v })}
                  onMove={() => {}}
                  onDelete={() => onSelect(null)}
                  onClose={() => onSelect(null)}
                />
              ) : shown != null ? (
                editable ? (
                  <button
                    className="sheet-chord font-chord cursor-grab rounded-[3px] text-left hover:bg-surface2 active:cursor-grabbing"
                    style={{
                      touchAction: 'pan-y', // 垂直捲動留給頁面，水平手勢才是拖曳
                      opacity: isDragging ? 0.35 : undefined,
                    }}
                    onPointerDown={(e) => onEdit({
                      type: 'dragStart', e,
                      start: u.chordStart, end: u.chordEnd, shown,
                    })}
                    onKeyDown={(e) => {
                      // 改用 pointerup 判定點擊後，鍵盤使用者要另外接
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect({ mode: 'edit', start: u.chordStart, end: u.chordEnd, shown });
                      }
                    }}
                    title="點一下編輯，拖曳可移動"
                  >
                    {shown}
                  </button>
                ) : (
                  <span className="sheet-chord font-chord">{shown}</span>
                )
              ) : editable ? (
                <button
                  className="sheet-chord font-chord rounded-[3px] px-1 text-left opacity-40 hover:bg-surface2 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); onSelect({ mode: 'insert', pos: u.textStart }); }}
                  title="在這個字上方加和弦"
                >
                  ＋
                </button>
              ) : (
                <span className="sheet-chord font-chord">{'\u00A0'}</span>
              ))}
            {editingLyric ? (
              <LyricEditor
                value={u.text}
                onCommit={(v) => onEdit({ type: 'lyric', start: u.textStart, end: u.textStart + u.text.length, value: v })}
                onClose={() => onSelect(null)}
              />
            ) : editable && u.text.trim() ? (
              <button
                className="sheet-lyric rounded-[3px] text-left hover:bg-surface2"
                onClick={(e) => { e.stopPropagation(); onSelect({ mode: 'lyric', start: u.textStart, lyricEnd: u.textStart + u.text.length }); }}
                title="點一下編輯歌詞"
              >
                {u.text}
              </button>
            ) : (
              <span className="sheet-lyric">{u.text || '\u00A0'}</span>
            )}
          </span>
        );
      })}
      {/* 行尾插入和弦：行尾沒有對應單元，所以在這裡獨立渲染輸入框 */}
      {editable && sel?.mode === 'insert' && sel.pos === lineEnd && (
        <span className="sheet-unit relative">
          <ChordEditor
            value=""
            canMove={false}
            onCommit={(v) => onEdit({ type: 'insert', pos: lineEnd, value: v })}
            onMove={() => {}}
            onDelete={() => onSelect(null)}
            onClose={() => onSelect(null)}
          />
          <span className="sheet-lyric">{'\u00A0'}</span>
        </span>
      )}
      {editable && !(sel?.mode === 'insert' && sel.pos === lineEnd) && (
        <LineControls
          onAddChord={() => onSelect({ mode: 'insert', pos: lineEnd })}
          onBreak={() => onEdit({ type: 'break', pos: lineEnd })}
          onSpace={() => onEdit({ type: 'space', pos: lineEnd })}
          onBackspace={() => onEdit({ type: 'backspace', pos: lineEnd })}
        />
      )}
    </div>
  );
}

export default function SongSheet({
  ast, semitones = 0, useFlat = false, fontSize = 18, showChords = true,
  editable = false, onSourceChange, onHighlight,
}) {
  const { meta, blocks } = ast;

  /* ---------- 直接在樂譜上編輯和弦 ---------- */
  const [sel, setSel] = useState(null);
  const [drag, setDrag] = useState(null);
  const [dropPos, setDropPos] = useState(null);
  const dragRef = useRef(null);
  const dropRef = useRef(null);
  dropRef.current = dropPos;

  // 鎖上時要把選取狀態清掉，不然解鎖回來還留著上次的編輯框
  useEffect(() => { if (!editable) setSel(null); }, [editable]);

  // 選到什麼就回報原始碼的哪一段，讓左邊編輯器反色並捲過去
  useEffect(() => {
    if (!onHighlight) return;
    if (!sel) return onHighlight(null);
    if (sel.mode === 'edit') return onHighlight({ start: sel.start, end: sel.end });
    if (sel.mode === 'lyric') return onHighlight({ start: sel.start, end: sel.lyricEnd ?? sel.start });
    if (sel.mode === 'insert') return onHighlight({ start: sel.pos, end: sel.pos });
  }, [sel, onHighlight]);

  const select = (v) => {
    if (!v) return setSel(null);
    if (v.mode === 'insert' || v.mode === 'lyric') return setSel(v);
    // 轉調中要先告訴使用者「原調會存成什麼」，不然他不知道自己改到了什麼
    const src = toSourceChord(v.shown, semitones, useFlat);
    setSel({ ...v, hint: semitones && src !== v.shown ? `原調存成 ${src}` : null });
  };

  /**
   * 拖曳搬和弦。
   * 難點：同一個按鈕既要能「點開編輯」又要能「拖著走」。
   * 用位移距離區分 —— 超過 6px 才算拖曳，否則放開時視為點擊。
   * 不這樣做的話，手指一碰到和弦就變成拖曳，永遠點不開編輯框。
   */
  const startDrag = (op) => {
    const e = op.e;
    if (e.button != null && e.button !== 0) return; // 只認左鍵
    const d = { start: op.start, end: op.end, shown: op.shown, x: e.clientX, y: e.clientY, moved: false };
    dragRef.current = d;
    setDrag(d);
    setSel(null);

    const onMove = (ev) => {
      const cur = dragRef.current;
      if (!cur) return;
      if (!cur.moved && Math.hypot(ev.clientX - cur.x, ev.clientY - cur.y) < 6) return;
      cur.moved = true;
      // 找游標/手指底下是哪個字
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const t = el?.closest?.('[data-pos]');
      setDropPos(t ? Number(t.dataset.pos) : null);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const cur = dragRef.current;
      const target = dropRef.current;
      dragRef.current = null;
      setDrag(null);
      setDropPos(null);
      if (!cur) return;

      if (!cur.moved) {
        // 沒移動 = 點擊 → 開編輯框
        select({ mode: 'edit', start: cur.start, end: cur.end, shown: cur.shown });
        return;
      }
      if (target == null) return; // 拖到空白處 = 放棄
      const r = moveChordTo(ast.source ?? '', cur.start, cur.end, target);
      if (r.moved) onSourceChange?.(r.source);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleEdit = (op) => {
    if (op.type === 'dragStart') return startDrag(op);

    // 一律以 ast.source（正規化過的）為基準，座標才對得上
    const src = ast.source ?? '';
    let r;
    switch (op.type) {
      case 'replace':
        r = replaceChord(src, op.start, op.end, toSourceChord(op.value, semitones, useFlat));
        break;
      case 'delete':
        r = removeChord(src, op.start, op.end);
        break;
      case 'lyric':
        r = replaceText(src, op.start, op.end, op.value);
        break;
      case 'space':
        onSourceChange?.(insertText(src, op.pos, ' ').source);
        return;
      case 'backspace': {
        const d = deleteBefore(src, op.pos);
        if (d.removed) onSourceChange?.(d.source);
        return;
      }
      case 'break':
        onSourceChange?.(breakLine(src, op.pos).source);
        return;
      case 'move': {
        r = moveChord(src, op.start, op.end, op.dir);
        if (!r.moved) return; // 已到行首/行尾，保持選取讓使用者再試別的方向
        onSourceChange?.(r.source);
        setSel((p) => (p ? { ...p, start: r.start, end: r.end } : null)); // 跟著和弦走
        return;
      }
      case 'insert': {
        const v = String(op.value ?? '').trim();
        if (!v) { setSel(null); return; } // 沒輸入就取消，不要塞一個沒人要的和弦
        r = insertChord(src, op.pos, toSourceChord(v, semitones, useFlat));
        onSourceChange?.(r.source);
        setSel(null);
        return;
      }
      default:
        return;
    }
    onSourceChange?.(r.source);
    setSel(null);
  };

  // 本曲用到的和弦（依出現順序去重，且已轉調）
  const chordList = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const raw of collectChords(ast)) {
      if (!isChord(raw)) continue;                 // 跳過 N.C.、| 等記號
      const t = transposeChord(raw, semitones, useFlat);
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }, [ast, semitones, useFlat]);

  // 解析失敗時 video 是 null，播放器整塊就不顯示（不能因為連結打錯就炸掉樂譜）
  const video = useMemo(() => parseYouTube(meta.youtube), [meta.youtube]);

  // 每個和弦各自記住目前顯示第幾種按法
  const [shapeIdx, setShapeIdx] = useState({});
  const cycle = (name, next) => setShapeIdx((p) => ({ ...p, [name]: next }));

  return (
    <article
      className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10"
      style={{ fontSize: `${fontSize}px` }}
      onClick={() => sel && setSel(null)}
    >
      <header className="mb-8 border-b border-line pb-5">
        <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">
          {meta.title || '未命名歌曲'}
        </h1>
        {(meta.artist || meta.subtitle) && (
          <p className="mt-1 text-[15px] text-muted">{meta.artist || meta.subtitle}</p>
        )}
        {(meta.key || meta.capo || meta.tempo) && (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-chord text-[13px] text-muted">
            {meta.key && <li>原調 {meta.key}</li>}
            {meta.capo && <li>Capo {meta.capo}</li>}
            {meta.tempo && <li>{meta.tempo} BPM</li>}
          </ul>
        )}
      </header>

      <VideoPlayer key={video?.id ?? 'no-video'} video={video} title={meta.title} />

      {showChords && chordList.length > 0 && (
        <section className="mb-8 border-b border-line pb-6">
          <h2 className="mb-3 font-display text-[11px] font-semibold uppercase tracking-widest text-muted">
            本曲和弦
          </h2>
          <div className="flex flex-wrap gap-x-2 gap-y-3">
            {chordList.map((name) => (
              <ChordCard
                key={name}
                name={name}
                shapeIndex={shapeIdx[name] ?? 0}
                onCycle={cycle}
              />
            ))}
          </div>
          <p className="no-print mt-3 text-[11px] text-muted">
            點和弦圖可切換不同按法
          </p>
        </section>
      )}

      {blocks.length === 0 && (
        <p className="text-muted">左側還沒有內容。輸入 <code className="font-chord">[C]歌詞</code> 就會出現在這裡。</p>
      )}

      <div className="space-y-6">
        {blocks.map((b, bi) => {
          if (b.type === 'comment') {
            return (
              <p key={bi} className="font-display text-[0.8em] font-semibold uppercase tracking-widest text-accent">
                {b.lines[0].text}
              </p>
            );
          }
          if (b.type === 'tab') {
            return (
              <pre
                key={bi}
                className="overflow-x-auto rounded-lg border border-line bg-surface2 p-4 font-chord text-[0.78em] leading-[1.5]"
              >
                {b.lines.map((l) => l.text).join('\n')}
              </pre>
            );
          }
          const isChorus = b.type === 'chorus';
          return (
            <section
              key={bi}
              className={isChorus ? 'border-l-[3px] border-chord pl-4' : ''}
            >
              {b.lines.map((l, li) => (
                <Line
                  key={li}
                  pairs={l.pairs}
                  semitones={semitones}
                  useFlat={useFlat}
                  editable={editable}
                  sel={sel}
                  onSelect={select}
                  onEdit={handleEdit}
                  drag={drag}
                  dropPos={dropPos}
                />
              ))}
            </section>
          );
        })}
      </div>
    </article>
  );
}
