import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

/**
 * 和弦就地編輯（輸入框直接長在和弦原本的位置上，不彈窗）
 *
 * 鍵盤行為的一致心智模型：**全選 = 操作和弦，非全選 = 編輯文字**
 *   剛點開時是全選 → ← → 搬和弦、Del/Backspace 刪和弦
 *   一開始打字就不是全選 → 方向鍵移游標、Del 刪字元（標準行為）
 *   想回到操作模式：Ctrl+A
 *
 * 為什麼不用 Alt+方向鍵：Chrome 的 Alt+← 是「返回上一頁」，會直接離開網站。
 *
 * 下方那排裸圖示不是給桌機的 —— 手機沒有實體方向鍵和 Del 鍵，
 * 沒有它們，手機就完全無法搬移和刪除。
 */
export default function ChordEditor({ value, onCommit, onMove, onDelete, onClose, hint, canMove = true }) {
  const [text, setText] = useState(value ?? '');
  const ref = useRef(null);
  const cancelled = useRef(false);

  useEffect(() => setText(value ?? ''), [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select(); // 進來就是全選 = 操作模式
  }, []);

  const commit = () => {
    const t = text.trim();
    if (t !== (value ?? '').trim()) onCommit(t);
    else onClose();
  };

  /** 目前是不是「操作模式」：全選，或內容是空的 */
  const inOperateMode = () => {
    const el = ref.current;
    if (!el) return false;
    if (el.value.length === 0) return true;
    return el.selectionStart === 0 && el.selectionEnd === el.value.length;
  };

  // 點下方圖示時不能讓輸入框失焦，否則 blur 會先把編輯結束掉
  const keepFocus = (e) => e.preventDefault();

  const icon = 'inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-accent';

  return (
    <span
      className="relative inline-flex"
      // 樂譜最外層有「點空白處關閉編輯框」的 handler。
      // 不擋住冒泡的話，點 ← → ✕ 也會被當成點空白處，編輯框會自己關掉。
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (cancelled.current) return; // Esc 取消時不要順手存下去
          // 只在值真的改了才存，而且刻意「不」呼叫 onClose。
          // 因為和弦被搬走時，這個輸入框會在舊位置被卸載，卸載會觸發 blur ——
          // 若在這裡 onClose，等於編輯框自己把自己關掉，使用者就沒辦法連續搬移。
          // 想關閉編輯框的路徑另有其人：Enter、Esc、點樂譜空白處。
          const t = text.trim();
          if (t !== (value ?? '').trim()) onCommit(t);
        }}
        onKeyDown={(e) => {
          e.stopPropagation(); // 別讓空白鍵觸發自動捲動、+ - 觸發轉調
          if (e.key === 'Enter') { commit(); return; }
          if (e.key === 'Escape') { cancelled.current = true; onClose(); return; }

          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            if (!canMove || !inOperateMode()) return; // 正在編輯文字 → 游標照常移動
            e.preventDefault();
            onMove(e.key === 'ArrowRight' ? 1 : -1);
            return;
          }

          if (e.key === 'Delete' || e.key === 'Backspace') {
            if (!inOperateMode()) return; // 正在編輯文字 → 照常刪字元
            e.preventDefault();
            onDelete();
          }
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        aria-label="和弦名稱"
        placeholder="和弦"
        // 寬度跟著內容長，排版才不會因為進入編輯而大幅跳動
        style={{ width: `${Math.max(2.5, text.length + 0.5)}ch`, color: 'var(--chord)' }}
        className="sheet-chord font-chord rounded-[3px] border-0 bg-transparent p-0 font-bold outline-none ring-1 ring-[var(--accent)] placeholder:font-normal placeholder:text-muted placeholder:opacity-50"
      />

      {/* 手機沒有方向鍵與 Del，這排是它們唯一的操作方式 */}
      <span className="absolute left-0 top-full z-30 flex items-center gap-0.5 pt-0.5">
        {canMove && (
          <>
            <button onMouseDown={keepFocus} onClick={() => onMove(-1)} className={icon} title="往左移一個字" aria-label="往左移一個字">
              <ArrowLeft size={13} />
            </button>
            <button onMouseDown={keepFocus} onClick={() => onMove(1)} className={icon} title="往右移一個字" aria-label="往右移一個字">
              <ArrowRight size={13} />
            </button>
          </>
        )}
        <button
          onMouseDown={keepFocus}
          onClick={onDelete}
          className={`${icon} hover:text-[var(--danger)]`}
          title={canMove ? '刪除這個和弦' : '取消'}
          aria-label={canMove ? '刪除這個和弦' : '取消'}
        >
          <X size={13} />
        </button>
        {hint && (
          <span className="whitespace-nowrap pl-1 font-chord text-[10px]" style={{ color: 'var(--chord)' }}>
            {hint}
          </span>
        )}
      </span>
    </span>
  );
}
