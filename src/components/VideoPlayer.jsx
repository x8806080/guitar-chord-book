import React, { useEffect, useState } from 'react';
import { Play, ChevronUp, ExternalLink } from 'lucide-react';
import { buildEmbedUrl, buildWatchUrl } from '../lib/youtube.js';

/**
 * YouTube 原曲播放器
 *
 * 三個刻意的設計：
 *  1. 沒按播放前不載入 iframe —— 不浪費流量，也不在使用者沒要求時被 YouTube 追蹤。
 *  2. 載入後絕不 unmount。「收起」只是把高度縮成 0，音樂繼續播。
 *     練琴時你會想收起畫面專心看譜，但音樂不能停。
 *  3. 換一首歌就重置成未載入。React 會重用同一個元件實例，
 *     若不重置，loaded 會殘留成 true，新影片的 iframe 直接帶著 autoplay=1 掛上去 ——
 *     結果就是「按過一次播放後，之後每首歌都自動播」。
 */
export default function VideoPlayer({ video, title }) {
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(true);

  // 換影片就回到未載入狀態。依賴 video.id 而非 video 物件本身 ——
  // 父層每次 render 都會產生新物件，用物件當依賴會導致轉調、改字級時音樂被切斷。
  const id = video?.id ?? null;
  useEffect(() => {
    setLoaded(false);
    setOpen(true);
  }, [id]);

  if (!video) return null;

  return (
    <section className="no-print mb-6">
      {!loaded ? (
        <button
          onClick={() => { setLoaded(true); setOpen(true); }}
          className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface2 px-3 py-2.5 text-left transition-colors hover:border-accent"
        >
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            <Play size={13} className="ml-0.5" />
          </span>
          <span className="flex-1 text-[13px]">播放原曲</span>
          <span className="font-chord text-[11px] text-muted">YouTube</span>
        </button>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="flex items-center gap-2 border-b border-line bg-surface2 px-3 py-1.5">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex flex-1 items-center gap-2 text-left text-[12px] text-muted hover:text-ink"
              aria-expanded={open}
            >
              <ChevronUp size={14} className={`transition-transform ${open ? '' : 'rotate-180'}`} />
              {open ? '收起畫面（音樂繼續播）' : '展開畫面'}
            </button>
            <a
              href={buildWatchUrl(video)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent"
              title="在 YouTube 開啟"
            >
              <ExternalLink size={12} />
            </a>
          </div>

          {/* height:0 而非 unmount —— iframe 保持存在，音樂不中斷 */}
          <div
            className="relative w-full transition-[height] duration-200"
            style={{ height: open ? undefined : 0, aspectRatio: open ? '16 / 9' : undefined }}
          >
            <iframe
              src={buildEmbedUrl(video, { autoplay: true })}
              title={`${title || '原曲'} — YouTube`}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </section>
  );
}
