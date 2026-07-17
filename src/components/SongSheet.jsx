import React, { useEffect, useMemo, useState } from 'react';
import { pairsToUnits, collectChords } from '../lib/chordpro.js';
import { transposeChordToken, transposeChord, isChord } from '../lib/chords.js';
import { ChordCard } from './ChordDiagram.jsx';
import ChordEditor from './ChordEditor.jsx';
import { replaceChord, removeChord, moveChord, insertChord, toSourceChord } from '../lib/chordedit.js';
import VideoPlayer from './VideoPlayer.jsx';
import { parseYouTube } from '../lib/youtube.js';

/**
 * 樂譜渲染
 * 排版核心：每個「單字」是一個 flex item（.sheet-unit），
 * 內含上排和弦 + 下排歌詞。換行只發生在 item 之間 →
 * 任何寬度下和弦都精準壓在該字正上方，不會跑版。
 */
function Line({ pairs, semitones, useFlat, editable, sel, onSelect, onEdit }) {
  const units = useMemo(() => pairsToUnits(pairs), [pairs]);
  const hasChord = units.some((u) => u.chord);

  return (
    <div className="sheet-line">
      {units.map((u, i) => {
        const shown = u.chord ? transposeChordToken(u.chord, semitones, useFlat) : null;
        const isSel = editable && sel && u.chordStart != null && sel.start === u.chordStart;

        return (
          <span className={`sheet-unit ${isSel ? 'relative' : ''}`} key={i}>
            {hasChord && (
              shown != null ? (
                editable ? (
                  <button
                    className="sheet-chord font-chord rounded-[3px] text-left hover:bg-surface2"
                    style={{ outline: isSel ? '1.5px solid var(--accent)' : undefined }}
                    onClick={(e) => { e.stopPropagation(); onSelect({ start: u.chordStart, end: u.chordEnd, shown }); }}
                    title="點一下編輯"
                  >
                    {shown}
                  </button>
                ) : (
                  <span className="sheet-chord font-chord">{shown}</span>
                )
              ) : editable ? (
                // 空位也可點：在這個字正上方插入新和弦
                <button
                  className="sheet-chord font-chord rounded-[3px] text-left opacity-25 hover:bg-surface2 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); onEdit({ type: 'insert', pos: u.textStart }); }}
                  title="在這個字上方加和弦"
                >
                  ＋
                </button>
              ) : (
                <span className="sheet-chord font-chord">{'\u00A0'}</span>
              )
            )}
            <span className="sheet-lyric">{u.text || '\u00A0'}</span>
            {isSel && (
              <ChordEditor
                value={sel.shown}
                hint={sel.hint}
                onCommit={(v) => onEdit({ type: 'replace', start: sel.start, end: sel.end, value: v })}
                onMove={(d) => onEdit({ type: 'move', start: sel.start, end: sel.end, dir: d })}
                onDelete={() => onEdit({ type: 'delete', start: sel.start, end: sel.end })}
                onClose={() => onSelect(null)}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

export default function SongSheet({
  ast, semitones = 0, useFlat = false, fontSize = 18, showChords = true,
  editable = false, onSourceChange,
}) {
  const { meta, blocks } = ast;

  /* ---------- 直接在樂譜上編輯和弦 ---------- */
  const [sel, setSel] = useState(null);

  // 鎖上時要把選取狀態清掉，不然解鎖回來還留著上次的編輯框
  useEffect(() => { if (!editable) setSel(null); }, [editable]);

  const select = (v) => {
    if (!v) return setSel(null);
    // 轉調中要先告訴使用者「原調會存成什麼」，不然他不知道自己改到了什麼
    const src = toSourceChord(v.shown, semitones, useFlat);
    setSel({ ...v, hint: semitones && src !== v.shown ? `原調存成 ${src}` : null });
  };

  const handleEdit = (op) => {
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
      case 'move': {
        r = moveChord(src, op.start, op.end, op.dir);
        if (!r.moved) return; // 已到行首/行尾，保持選取讓使用者再試別的方向
        onSourceChange?.(r.source);
        setSel((p) => (p ? { ...p, start: r.start, end: r.end } : null)); // 跟著和弦走
        return;
      }
      case 'insert':
        r = insertChord(src, op.pos, toSourceChord('C', semitones, useFlat));
        onSourceChange?.(r.source);
        setSel(null);
        return;
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
                />
              ))}
            </section>
          );
        })}
      </div>
    </article>
  );
}
