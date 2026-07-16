import React, { useMemo } from 'react';
import { generateShapes } from '../lib/chordshapes.js';

/**
 * 和弦指板圖（左手按法）
 *
 * 遵循通用的和弦圖記譜慣例：
 *   - 垂直線 = 弦，最左是第6弦(低E)，最右是第1弦(高E)
 *   - 水平線 = 品絲；最上方粗線 = 上弦枕（僅開放把位）
 *   - 實心點 = 要按的位置
 *   - 橫條 = 大橫按
 *   - o = 開放彈奏，x = 不彈（悶音）
 *   - 右側 "5fr" = 這張圖從第 5 品開始
 */

const SW = 11;   // 弦間距
const FH = 13;   // 品格高
const PAD_T = 16; // 上緣（放 x/o）
const PAD_L = 8;
const PAD_R = 14; // 右緣（放 "5fr"）
const ROWS = 4;   // 顯示幾個品格

const BOARD_W = SW * 5;
const BOARD_H = FH * ROWS;
const VB_W = PAD_L + BOARD_W + PAD_R;
const VB_H = PAD_T + BOARD_H + 4;

export function ChordDiagram({ shape, size = 1, className = '' }) {
  if (!shape) return null;
  const { frets, baseFret, barre } = shape;
  const isOpenPos = baseFret === 1;

  const x = (str) => PAD_L + str * SW;             // str: 0=第6弦 … 5=第1弦
  const y = (fret) => PAD_T + (fret - baseFret + 0.5) * FH; // 點的中心

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={VB_W * size}
      height={VB_H * size}
      className={className}
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      {/* 上弦枕：只有開放把位才畫粗線 */}
      {isOpenPos && (
        <rect x={PAD_L - 0.5} y={PAD_T - 2.5} width={BOARD_W + 1} height={2.5} fill="var(--text)" rx={0.5} />
      )}

      {/* 品絲 */}
      {Array.from({ length: ROWS + 1 }, (_, i) => (
        <line
          key={`f${i}`}
          x1={PAD_L} y1={PAD_T + i * FH}
          x2={PAD_L + BOARD_W} y2={PAD_T + i * FH}
          stroke="var(--muted)" strokeWidth={0.7} opacity={0.55}
        />
      ))}

      {/* 弦 */}
      {Array.from({ length: 6 }, (_, i) => (
        <line
          key={`s${i}`}
          x1={x(i)} y1={PAD_T} x2={x(i)} y2={PAD_T + BOARD_H}
          stroke="var(--muted)" strokeWidth={0.7} opacity={0.55}
        />
      ))}

      {/* 起始把位標記 */}
      {!isOpenPos && (
        <text
          x={PAD_L + BOARD_W + 3} y={y(baseFret)} dominantBaseline="middle"
          fontSize={7.5} fill="var(--muted)" fontFamily="ui-monospace, monospace"
        >
          {baseFret}fr
        </text>
      )}

      {/* 頂端的 x / o */}
      {frets.map((f, i) =>
        f < 0 ? (
          <g key={`m${i}`} stroke="var(--muted)" strokeWidth={1.1} strokeLinecap="round">
            <line x1={x(i) - 2.2} y1={PAD_T - 8.2} x2={x(i) + 2.2} y2={PAD_T - 3.8} />
            <line x1={x(i) + 2.2} y1={PAD_T - 8.2} x2={x(i) - 2.2} y2={PAD_T - 3.8} />
          </g>
        ) : f === 0 ? (
          <circle
            key={`o${i}`} cx={x(i)} cy={PAD_T - 6} r={2.1}
            fill="none" stroke="var(--muted)" strokeWidth={1}
          />
        ) : null
      )}

      {/* 大橫按 */}
      {barre && (
        <rect
          x={x(barre.from) - 3.4} y={y(barre.fret) - 3.4}
          width={(barre.to - barre.from) * SW + 6.8} height={6.8}
          rx={3.4} fill="var(--chord)"
        />
      )}

      {/* 按弦點（大橫按已涵蓋的就不重畫） */}
      {frets.map((f, i) => {
        if (f <= 0) return null;
        if (barre && f === barre.fret && i >= barre.from && i <= barre.to) return null;
        return <circle key={`d${i}`} cx={x(i)} cy={y(f)} r={3.4} fill="var(--chord)" />;
      })}
    </svg>
  );
}

/**
 * 一格：和弦名 + 圖。點擊可切換到下一個指型。
 */
export function ChordCard({ name, shapeIndex = 0, onCycle, size = 1 }) {
  const shapes = useMemo(() => generateShapes(name, { maxResults: 4 }), [name]);
  const shape = shapes[shapeIndex % Math.max(shapes.length, 1)] ?? null;

  const body = (
    <>
      <span className="font-chord text-[12px] font-bold" style={{ color: 'var(--chord)' }}>
        {name}
      </span>
      {shape ? (
        <ChordDiagram shape={shape} size={size} />
      ) : (
        <span className="py-3 text-[10px] text-muted">查無指型</span>
      )}
    </>
  );

  // 只有一種指型時不做成按鈕，避免點了沒反應
  if (!onCycle || shapes.length <= 1) {
    return <div className="flex select-none flex-col items-center gap-1">{body}</div>;
  }

  return (
    <button
      onClick={() => onCycle(name, (shapeIndex + 1) % shapes.length)}
      className="flex select-none flex-col items-center gap-1 rounded-lg p-1 transition-colors hover:bg-surface2"
      title={`${name}：第 ${(shapeIndex % shapes.length) + 1} / ${shapes.length} 種按法（點一下換）`}
    >
      {body}
    </button>
  );
}

export default ChordDiagram;
