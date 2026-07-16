/**
 * autoscroll.js — 自動捲動
 *
 * 練琴時雙手都在吉他上，沒手滑手機。這是這個工具能不能取代紙本的關鍵。
 *
 * 純計算的部分抽成函式方便測試；副作用（rAF、Wake Lock）留在 hook 裡。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** 速度範圍（px/秒）。18px 字級下，一行約 41px，20 px/s ≈ 每分鐘 29 行 */
export const SPEED_MIN = 5;
export const SPEED_MAX = 60;
export const SPEED_STEP = 5;
export const SPEED_DEFAULT = 20;

export const clampSpeed = (v) =>
  Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(v / SPEED_STEP) * SPEED_STEP));

/** 這一幀該捲到哪 */
export const nextScrollTop = (current, speed, dt, maxScroll) =>
  Math.min(Math.max(current + speed * dt, 0), Math.max(maxScroll, 0));

/** 可捲動的最大距離 */
export const maxScrollOf = (el) => Math.max(0, el.scrollHeight - el.clientHeight);

/** 是否已到底（留 1px 容差，瀏覽器縮放時 scrollTop 可能有小數誤差） */
export const isAtBottom = (el) => el.scrollTop >= maxScrollOf(el) - 1;

/** 內容是否短到根本不用捲 */
export const isScrollable = (el) => maxScrollOf(el) > 4;

/**
 * 捲回頂端。
 * `el?.scrollTo` 的 optional chaining 只防 el 是 null，不防「scrollTo 這個方法不存在」——
 * 舊版 WebView 與部分瀏覽器沒有 scrollTo(options)，直接呼叫會 TypeError 炸掉整個 App。
 */
export function scrollToTop(el, smooth = true) {
  if (!el) return;
  try {
    el.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
  } catch {
    el.scrollTop = 0; // 沒有平滑動畫，但至少會動
  }
}

/**
 * @param {React.RefObject<HTMLElement>} ref 捲動容器
 * @param {number} speed px/秒
 * @returns {{playing, toggle, stop, start, backToTop, canScroll}}
 */
export function useAutoScroll(ref, speed = SPEED_DEFAULT) {
  const [playing, setPlaying] = useState(false);
  const [canScroll, setCanScroll] = useState(false);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // 內容變了就重新判斷需不需要捲（換歌、改字級、開關和弦圖）
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const check = () => setCanScroll(isScrollable(el));
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [ref]);

  /* ---- 捲動迴圈 ---- */
  useEffect(() => {
    if (!playing) return;
    const el = ref.current;
    if (!el) return;

    let raf;
    let last = performance.now();

    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.1); // 分頁切回來時 dt 會爆大，夾住
      last = now;

      const max = maxScrollOf(el);
      el.scrollTop = nextScrollTop(el.scrollTop, speedRef.current, dt, max);

      if (el.scrollTop >= max - 1) { setPlaying(false); return; } // 到底自動停
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, ref]);

  /* ---- 防止螢幕休眠 ---- */
  // 捲到一半螢幕暗掉，整個功能就白做了。
  // Wake Lock 需要 HTTPS（GitHub Pages 有），不支援的瀏覽器靜默略過。
  useEffect(() => {
    if (!playing || !navigator.wakeLock) return;
    let lock = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request('screen');
        if (cancelled) { l.release().catch(() => {}); return; }
        lock = l;
      } catch { /* 使用者拒絕或不支援，不影響捲動本身 */ }
    };
    acquire();

    // 切走再切回來時 lock 會被系統釋放，要重拿
    const onVis = () => { if (document.visibilityState === 'visible' && !lock) acquire(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release?.().catch(() => {});
    };
  }, [playing]);

  const start = useCallback(() => setPlaying(true), []);
  const stop = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => setPlaying((p) => !p), []);
  const backToTop = useCallback(() => {
    setPlaying(false);
    scrollToTop(ref.current, true);
  }, [ref]);

  return { playing, toggle, stop, start, backToTop, canScroll };
}
