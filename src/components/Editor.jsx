import React, { useRef } from 'react';

const SNIPPETS = [
  { label: '和弦', insert: '[C]' },
  { label: '標題', insert: '{title: }' },
  { label: '註解', insert: '{comment: }' },
  { label: 'YT', insert: '{youtube: }' },
  { label: '副歌', insert: '{start_of_chorus}\n\n{end_of_chorus}' },
  { label: 'TAB', insert: '{start_of_tab}\n\n{end_of_tab}' },
];

/**
 * ChordPro 編輯器
 * - 支援選取文字後直接包上 [ ]（快速標和弦）
 * - Tab 鍵插入兩格空白而非跳離欄位
 */
export default function Editor({ value, onChange }) {
  const ref = useRef(null);

  const insertAt = (text) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const next = value.slice(0, s) + text + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = s + text.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const handleKeyDown = (ev) => {
    const el = ref.current;
    if (ev.key === 'Tab') {
      ev.preventDefault();
      insertAt('  ');
    }
    // 選取文字時按 [ → 直接包成和弦
    if (ev.key === '[' && el.selectionStart !== el.selectionEnd) {
      ev.preventDefault();
      const { selectionStart: s, selectionEnd: e } = el;
      onChange(value.slice(0, s) + '[' + value.slice(s, e) + ']' + value.slice(e));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-line">
      <div className="no-print flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        {SNIPPETS.map((s) => (
          <button
            key={s.label}
            onClick={() => insertAt(s.insert)}
            className="rounded-md border border-line px-2 py-1 font-chord text-[11px] text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {s.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted">選取文字按 <kbd className="font-chord">[</kbd> 可快速標和弦</span>
      </div>

      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        placeholder={'{title: 歌名}\n{artist: 演唱者}\n\n[C]Twinkle, twinkle, [F]little [C]star'}
        className="min-h-0 flex-1 resize-none bg-transparent p-4 font-chord text-[13px] leading-[1.75] text-ink outline-none placeholder:text-muted"
      />
    </div>
  );
}
