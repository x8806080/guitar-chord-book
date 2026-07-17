import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

/**
 * 和弦內嵌編輯器（點樂譜上的和弦後跳出）
 *
 * 幾個刻意的取捨：
 *  - 用「左移／右移」而不是拖曳。拖曳在手機上很難精準，而且練琴時常單手操作；
 *    按鈕點一下移一個字，反而更快也更準。
 *  - 輸入框自動全選：多數情況是整個換掉，不是改一個字母。
 *  - Enter 存、Esc 取消，跟所有編輯器一致。
 */
export default function ChordEditor({ value, onCommit, onMove, onDelete, onClose, hint }) {
  const [text, setText] = useState(value);
  const ref = useRef(null);

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const commit = () => {
    const t = text.trim();
    if (t !== value) onCommit(t);
    else onClose();
  };

  return (
    <div
      className="absolute left-0 top-full z-30 mt-1 flex flex-col gap-1 rounded-lg border border-line p-1.5 shadow-lg"
      style={{ background: 'var(--surface)' }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="編輯和弦"
    >
      <div className="flex items-center gap-1">
        <input
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation(); // 不要讓空白鍵去觸發自動捲動、+ - 去觸發轉調
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') onClose();
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="和弦名稱"
          className="w-[5.5rem] rounded-md border border-line bg-bg px-2 py-1 font-chord text-[13px] font-bold outline-none focus:border-accent"
          style={{ color: 'var(--chord)' }}
        />
        <button
          onClick={() => onMove(-1)}
          title="往左移一個字"
          aria-label="往左移一個字"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted hover:border-accent hover:text-accent"
        >
          <ArrowLeft size={13} />
        </button>
        <button
          onClick={() => onMove(1)}
          title="往右移一個字"
          aria-label="往右移一個字"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted hover:border-accent hover:text-accent"
        >
          <ArrowRight size={13} />
        </button>
        <button
          onClick={onDelete}
          title="刪除這個和弦"
          aria-label="刪除這個和弦"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted hover:border-[var(--danger)] hover:text-[var(--danger)]"
        >
          <X size={13} />
        </button>
      </div>

      {/* 轉調中要講清楚會寫回什麼，不然使用者會不知道原調被改成什麼 */}
      {hint && <p className="px-0.5 font-chord text-[10px] text-muted">{hint}</p>}
    </div>
  );
}
