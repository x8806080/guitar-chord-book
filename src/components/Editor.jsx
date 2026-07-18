import React, { useEffect, useRef } from 'react';

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
 * - 在右邊樂譜上點和弦/歌詞時，這裡會反色標出對應的原始碼並自動捲過去
 *
 * 反色為什麼要用疊圖層：textarea 沒辦法把內容的某一段上色，
 * 而 setSelectionRange 的選取在 textarea 沒有 focus 時是看不見的 ——
 * 但我們不能搶 focus，那會讓樂譜上的輸入框失焦、編輯直接中斷。
 * 所以在 textarea 底下疊一層一模一樣排版的 div，由它負責畫顏色。
 */
export default function Editor({ value, onChange, highlight }) {
  const ref = useRef(null);
  const hlRef = useRef(null);
  const markRef = useRef(null);

  // 兩層的字型、行高、padding、換行規則必須完全一致，否則反色會偏位
  const LAYOUT = 'whitespace-pre-wrap break-words p-4 font-chord text-[13px] leading-[1.75]';

  // 反色範圍變了就捲到看得見的地方（連同 textarea 一起捲，兩層才不會脫節）
  useEffect(() => {
    const m = markRef.current;
    const hl = hlRef.current;
    const ta = ref.current;
    if (!m || !hl || !ta) return;
    m.scrollIntoView({ block: 'nearest' });
    ta.scrollTop = hl.scrollTop;
  }, [highlight?.start, highlight?.end]);

  const hasMark =
    highlight && Number.isFinite(highlight.start) && highlight.end > highlight.start;

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

      <div className="relative min-h-0 flex-1">
        {/* 底層：只負責畫反色，不接任何互動 */}
        <div
          ref={hlRef}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 overflow-auto text-transparent ${LAYOUT}`}
        >
          {hasMark ? (
            <>
              {value.slice(0, highlight.start)}
              <mark
                ref={markRef}
                className="rounded-[2px] text-transparent"
                style={{ background: 'var(--accent)', opacity: 0.28 }}
              >
                {value.slice(highlight.start, highlight.end) || ' '}
              </mark>
              {value.slice(highlight.end)}
            </>
          ) : (
            value
          )}
          {'\n'}
        </div>

        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={(e) => { if (hlRef.current) hlRef.current.scrollTop = e.currentTarget.scrollTop; }}
          spellCheck={false}
          placeholder={'{title: 歌名}\n{artist: 演唱者}\n\n[C]歌詞寫在這裡'}
          className={`absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent text-ink outline-none placeholder:text-muted ${LAYOUT}`}
        />
      </div>
    </div>
  );
}
