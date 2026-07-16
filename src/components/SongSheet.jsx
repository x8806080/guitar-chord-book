import React, { useMemo } from 'react';
import { pairsToUnits } from '../lib/chordpro.js';
import { transposeChordToken } from '../lib/chords.js';

/**
 * 樂譜渲染
 * 排版核心：每個「單字」是一個 flex item（.sheet-unit），
 * 內含上排和弦 + 下排歌詞。換行只發生在 item 之間 →
 * 任何寬度下和弦都精準壓在該字正上方，不會跑版。
 */
function Line({ pairs, semitones, useFlat }) {
  const units = useMemo(() => pairsToUnits(pairs), [pairs]);
  const hasChord = units.some((u) => u.chord);

  return (
    <div className="sheet-line">
      {units.map((u, i) => (
        <span className="sheet-unit" key={i}>
          {hasChord && (
            <span className="sheet-chord font-chord">
              {u.chord ? transposeChordToken(u.chord, semitones, useFlat) : '\u00A0'}
            </span>
          )}
          <span className="sheet-lyric">{u.text || '\u00A0'}</span>
        </span>
      ))}
    </div>
  );
}

export default function SongSheet({ ast, semitones = 0, useFlat = false, fontSize = 18 }) {
  const { meta, blocks } = ast;

  return (
    <article
      className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10"
      style={{ fontSize: `${fontSize}px` }}
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
                <Line key={li} pairs={l.pairs} semitones={semitones} useFlat={useFlat} />
              ))}
            </section>
          );
        })}
      </div>
    </article>
  );
}
