import React from 'react';
import { Minus, Plus, RotateCcw, Type, Printer, Guitar, Lock, Unlock } from 'lucide-react';
import { currentKeyLabel } from '../lib/chords.js';

const btn =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line ' +
  'bg-surface text-ink transition-colors hover:border-accent hover:text-accent ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

/**
 * 轉調控制面板（Signature 元件：「移調夾」）
 * 中央銅色晶片顯示「目前調性」，下方小字顯示相對原調的位移量。
 */
export default function TransposeBar({
  baseKey,
  semitones,
  onChange,
  useFlat,
  onToggleFlat,
  fontSize,
  onFontSize,
  showChords,
  onToggleChords,
  editable,
  onToggleEditable,
}) {
  const label = currentKeyLabel(baseKey, semitones);
  const delta = semitones > 0 ? `+${semitones}` : semitones < 0 ? `${semitones}` : '原調';

  return (
    <div className="no-print flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <button
          className={btn}
          onClick={() => onChange(semitones - 1)}
          disabled={semitones <= -11}
          aria-label="降一個半音"
          title="降調 (−)"
        >
          <Minus size={16} />
        </button>

        {/* 移調夾晶片 */}
        <div
          className="flex h-9 min-w-[76px] flex-col items-center justify-center rounded-lg px-3 leading-none"
          style={{ background: 'var(--chord)', color: 'var(--bg)' }}
          aria-live="polite"
        >
          <span className="font-chord text-[15px] font-bold">{label}</span>
          <span className="mt-0.5 font-chord text-[9px] opacity-75">{delta}</span>
        </div>

        <button
          className={btn}
          onClick={() => onChange(semitones + 1)}
          disabled={semitones >= 11}
          aria-label="升一個半音"
          title="升調 (+)"
        >
          <Plus size={16} />
        </button>

        <button
          className={btn}
          onClick={() => onChange(0)}
          disabled={semitones === 0}
          aria-label="回到原調"
          title="回到原調 (0)"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      <span className="mx-1 h-6 w-px bg-line" />

      <button
        className={btn}
        onClick={onToggleEditable}
        title={editable ? '鎖定樂譜（練琴時避免誤觸）' : '解鎖：可直接點和弦編輯'}
        aria-pressed={editable}
        style={{ color: editable ? 'var(--accent)' : undefined }}
      >
        {editable ? <Unlock size={15} /> : <Lock size={15} />}
      </button>

      <button
        className={btn}
        onClick={onToggleChords}
        title={showChords ? '隱藏和弦圖' : '顯示和弦圖'}
        aria-pressed={showChords}
        style={{ color: showChords ? 'var(--chord)' : undefined }}
      >
        <Guitar size={15} />
      </button>

      <button
        className={`${btn} w-auto px-2.5 font-chord text-xs font-bold`}
        onClick={onToggleFlat}
        title="切換升/降記號拼法"
        aria-pressed={useFlat}
      >
        {useFlat ? '♭' : '♯'}
      </button>

      <label className="hidden items-center gap-2 sm:flex" title="樂譜字級">
        <Type size={15} className="text-muted" />
        <input
          type="range"
          min="14"
          max="30"
          step="1"
          value={fontSize}
          onChange={(e) => onFontSize(Number(e.target.value))}
          className="h-1 w-20 accent-[var(--accent)]"
          aria-label="樂譜字級"
        />
      </label>

      <button className={`${btn} hidden sm:inline-flex`} onClick={() => window.print()} title="列印樂譜">
        <Printer size={15} />
      </button>
    </div>
  );
}
