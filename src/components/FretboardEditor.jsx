import React, { useEffect, useMemo, useState } from 'react';
import { X, RotateCcw, Trash2, Check, ChevronUp, ChevronDown } from 'lucide-react';
import { bestShape, analyzeShape } from '../lib/chordshapes.js';

/**
 * 指板編輯器：用點的方式自訂和弦指型
 *
 * 互動：
 *   點格子 → 那條弦按在這一品（同弦再點別品會換位置，點同一格取消）
 *   點弦最上方的圈 → 在「開放 / 靜音」之間切換
 *   上下鈕 → 移動整個把位視窗（顯示第幾品開始）
 *
 * 存的是「按弦位」，不是文字碼 —— 使用者不需要懂 x32010 的規則。
 */

const STR = 6;      // 六條弦
const ROWS = 5;     // 顯示幾個品格
const CW = 34;      // 每弦間距
const RH = 30;      // 每品高
const PAD_T = 40;   // 頂端放 x/o
const PAD_L = 26;   // 左邊放品數（要容得下兩位數如 12）
const PAD_R = 12;
const BW = CW * (STR - 1);
const BH = RH * ROWS;
const W = PAD_L + BW + PAD_R;
const H = PAD_T + BH + 12;

export default function FretboardEditor({ chordName, initialFrets, onSave, onDelete, onClose, hasCustom }) {
  // frets：第6弦(低E)→第1弦(高E)，-1 靜音、0 開放、>0 按弦
  const [frets, setFrets] = useState(() =>
    initialFrets?.length === 6 ? [...initialFrets] : [-1, -1, -1, -1, -1, -1]
  );
  // baseFret：這張圖從第幾品畫起
  const [baseFret, setBaseFret] = useState(() => {
    const pressed = (initialFrets || []).filter((f) => f > 0);
    if (!pressed.length) return 1;
    const min = Math.min(...pressed);
    return min > 1 && !initialFrets.includes(0) ? min : 1;
  });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const x = (str) => PAD_L + str * CW;                 // str: 0=第6弦
  const y = (row) => PAD_T + (row + 0.5) * RH;         // row: 0..ROWS-1
  const fretOfRow = (row) => baseFret + row;

  const setString = (str, val) => setFrets((p) => p.map((f, i) => (i === str ? val : f)));

  const clickCell = (str, row) => {
    const fret = fretOfRow(row);
    setString(str, frets[str] === fret ? -1 : fret); // 點同格取消
  };
  const toggleTop = (str) => {
    // 圈：開放(0) ↔ 靜音(-1)。若原本是按弦，先回到開放
    setString(str, frets[str] === 0 ? -1 : 0);
  };

  // 即時算橫按（純顯示，存的時候一起帶上）
  const analyzed = useMemo(() => analyzeShape(frets), [frets]);
  const barre = analyzed?.barre ?? null;
  const isOpenPos = baseFret === 1;

  const canSave = frets.filter((f) => f >= 0).length >= 2; // 至少兩條弦有聲音

  const reset = () => {
    const b = bestShape(chordName, { includeCustom: false });
    if (b) {
      setFrets([...b.frets]);
      setBaseFret(b.baseFret ?? 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl border border-line bg-surface p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`編輯 ${chordName} 指型`}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-[15px] font-bold">
            自訂 <span style={{ color: 'var(--chord)' }} className="font-chord">{chordName}</span> 指型
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="關閉"><X size={18} /></button>
        </div>
        <p className="mb-2 text-[12px] text-muted">點格子按弦，點上方圓圈切換開放／靜音</p>

        <div className="flex items-start gap-2">
          {/* 起始品：可直接輸入第幾格 */}
          <div className="flex flex-col items-center gap-1 pt-7">
            <span className="text-[10px] text-muted">起始品</span>
            <input
              type="number"
              min={1}
              max={17}
              value={baseFret}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) setBaseFret(Math.max(1, Math.min(17, v)));
              }}
              aria-label="起始品位"
              className="w-12 rounded-lg border border-line bg-bg px-1 py-1 text-center font-chord text-[15px] font-bold outline-none focus:border-accent"
              style={{ color: 'var(--chord)' }}
            />
            <div className="flex gap-1">
              <button
                onClick={() => setBaseFret((b) => Math.max(1, b - 1))}
                disabled={baseFret <= 1}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-line text-muted hover:border-accent hover:text-accent disabled:opacity-30"
                aria-label="把位往低移" title="往低一品"
              >
                <ChevronUp size={13} />
              </button>
              <button
                onClick={() => setBaseFret((b) => Math.min(17, b + 1))}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-line text-muted hover:border-accent hover:text-accent"
                aria-label="把位往高移" title="往高一品"
              >
                <ChevronDown size={13} />
              </button>
            </div>
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="flex-1" style={{ maxHeight: 280 }} role="img" aria-label="指板">
            {/* 上弦枕（僅第一品）或起始品數 */}
            {isOpenPos ? (
              <rect x={PAD_L - 1} y={PAD_T - 3} width={BW + 2} height={3} rx={1} fill="var(--text)" />
            ) : null}

            {/* 每一品左邊標出實際品數 —— 橫按壓第幾格一眼可見 */}
            {Array.from({ length: ROWS }, (_, row) => (
              <text
                key={`fn${row}`}
                x={PAD_L - 8} y={y(row)} textAnchor="end" dominantBaseline="middle"
                fontSize={10}
                fill={barre && barre.fret === fretOfRow(row) ? 'var(--chord)' : 'var(--muted)'}
                fontWeight={barre && barre.fret === fretOfRow(row) ? 'bold' : 'normal'}
                fontFamily="ui-monospace, monospace"
              >
                {fretOfRow(row)}
              </text>
            ))}

            {/* 品絲 */}
            {Array.from({ length: ROWS + 1 }, (_, i) => (
              <line key={`f${i}`} x1={PAD_L} y1={PAD_T + i * RH} x2={PAD_L + BW} y2={PAD_T + i * RH} stroke="var(--line)" strokeWidth={1} />
            ))}
            {/* 弦 */}
            {Array.from({ length: STR }, (_, i) => (
              <line key={`s${i}`} x1={x(i)} y1={PAD_T} x2={x(i)} y2={PAD_T + BH} stroke="var(--muted)" strokeWidth={0.8} opacity={0.6} />
            ))}

            {/* 頂端 x / o（可點） */}
            {frets.map((f, i) => (
              <g key={`t${i}`} onClick={() => toggleTop(i)} style={{ cursor: 'pointer' }}>
                <circle cx={x(i)} cy={PAD_T - 18} r={11} fill="transparent" />
                {f < 0 ? (
                  <g stroke="var(--muted)" strokeWidth={1.4} strokeLinecap="round">
                    <line x1={x(i) - 4} y1={PAD_T - 22} x2={x(i) + 4} y2={PAD_T - 14} />
                    <line x1={x(i) + 4} y1={PAD_T - 22} x2={x(i) - 4} y2={PAD_T - 14} />
                  </g>
                ) : f === 0 ? (
                  <circle cx={x(i)} cy={PAD_T - 18} r={4.5} fill="none" stroke="var(--muted)" strokeWidth={1.4} />
                ) : null}
              </g>
            ))}

            {/* 橫按條 */}
            {barre && (
              <rect
                x={x(barre.from) - 6} y={y(barre.fret - baseFret) - 6}
                width={(barre.to - barre.from) * CW + 12} height={12} rx={6}
                fill="var(--chord)" opacity={0.9}
              />
            )}

            {/* 可點的格子 + 已按的點 */}
            {Array.from({ length: STR }, (_, str) =>
              Array.from({ length: ROWS }, (_, row) => {
                const fret = fretOfRow(row);
                const on = frets[str] === fret;
                const inBarre = barre && fret === barre.fret && str >= barre.from && str <= barre.to;
                return (
                  <g key={`c${str}-${row}`} onClick={() => clickCell(str, row)} style={{ cursor: 'pointer' }}>
                    <rect x={x(str) - CW / 2} y={PAD_T + row * RH} width={CW} height={RH} fill="transparent" />
                    {on && !inBarre && <circle cx={x(str)} cy={y(row)} r={9} fill="var(--chord)" />}
                  </g>
                );
              })
            )}
          </svg>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-muted hover:border-accent hover:text-accent"
            title="回到演算法建議的指型"
          >
            <RotateCcw size={13} /> 重設
          </button>
          {hasCustom && (
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-muted hover:border-[var(--danger)] hover:text-[var(--danger)]"
              title="刪除自訂，回到演算法版本"
            >
              <Trash2 size={13} /> 刪除自訂
            </button>
          )}
          <button
            onClick={() => onSave({ frets: [...frets], baseFret, barre })}
            disabled={!canSave}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-medium disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            <Check size={14} /> 儲存
          </button>
        </div>
      </div>
    </div>
  );
}
