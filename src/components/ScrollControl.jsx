import React from 'react';
import { Play, Pause, Minus, Plus, ArrowUpToLine } from 'lucide-react';
import { SPEED_MIN, SPEED_MAX, stepSpeed } from '../lib/autoscroll.js';

/**
 * 自動捲動控制
 *
 * 設計前提：使用者雙手在吉他上，這是他「最後一次碰螢幕」的機會。
 *  - 播放鍵做大（48px），拇指不用瞄準
 *  - 懸浮在右下，手機單手可及
 *  - 播放中變半透明，不擋歌詞；碰到就恢復
 */
export default function ScrollControl({ playing, onToggle, speed, onSpeed, onTop, visible }) {
  if (!visible) return null;

  const step = (d) => onSpeed(stepSpeed(speed, d));

  return (
    <div
      className={`no-print pointer-events-auto absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-full border border-line p-1 shadow-lg transition-opacity ${
        playing ? 'opacity-40 hover:opacity-100 focus-within:opacity-100' : 'opacity-100'
      }`}
      style={{ background: 'var(--surface)' }}
    >
      <button
        onClick={onTop}
        title="回到開頭"
        aria-label="回到開頭"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-accent"
      >
        <ArrowUpToLine size={16} />
      </button>

      <button
        onClick={() => step(-1)}
        disabled={speed <= SPEED_MIN}
        title="捲慢一點"
        aria-label="捲慢一點"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-accent disabled:opacity-30"
      >
        <Minus size={16} />
      </button>

      <span
        className="min-w-[2.4rem] text-center font-chord text-[13px] font-bold tabular-nums"
        aria-live="polite"
        aria-label={`捲動速度 ${speed}`}
        style={{ color: 'var(--chord)' }}
      >
        {speed}
      </span>

      <button
        onClick={() => step(1)}
        disabled={speed >= SPEED_MAX}
        title="捲快一點"
        aria-label="捲快一點"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-accent disabled:opacity-30"
      >
        <Plus size={16} />
      </button>

      {/* 主鍵做大：這是雙手離開螢幕前最後按的東西 */}
      <button
        onClick={onToggle}
        title={playing ? '暫停捲動（空白鍵）' : '開始捲動（空白鍵）'}
        aria-label={playing ? '暫停捲動' : '開始捲動'}
        aria-pressed={playing}
        className="inline-flex h-12 w-12 items-center justify-center rounded-full transition-transform active:scale-95"
        style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
      >
        {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
      </button>
    </div>
  );
}
