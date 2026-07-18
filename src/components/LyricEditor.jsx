import React, { useEffect, useRef, useState } from 'react';

/**
 * 歌詞就地編輯（點歌詞後，那個字/單字本身變成輸入框）
 *
 * 一次只編輯一個「排版單元」而不是整行，因為：
 *   整行編輯的話，使用者一改字數，那一行所有和弦的字元座標全部偏移，
 *   和弦會集體跑位。單元編輯只影響自己的範圍，前後和弦位置不受影響。
 */
export default function LyricEditor({ value, onCommit, onClose }) {
  const [text, setText] = useState(value ?? '');
  const ref = useRef(null);
  const cancelled = useRef(false);

  useEffect(() => setText(value ?? ''), [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const commit = () => {
    const t = text;
    if (t !== (value ?? '')) onCommit(t);
    else onClose();
  };

  return (
    <input
      ref={ref}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => {
        if (cancelled.current) return;
        // 只在真的改了才寫入，且不主動關閉 ——
        // 卸載時也會觸發 blur，在這裡關會讓編輯框自己消失
        if (text !== (value ?? '')) onCommit(text);
      }}
      onKeyDown={(e) => {
        e.stopPropagation(); // 別讓空白鍵觸發自動捲動
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { cancelled.current = true; onClose(); }
      }}
      spellCheck={false}
      aria-label="歌詞"
      style={{ width: `${Math.max(2, text.length + 0.5)}ch` }}
      className="sheet-lyric rounded-[3px] border-0 bg-transparent p-0 outline-none ring-1 ring-[var(--accent)]"
    />
  );
}
