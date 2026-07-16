/**
 * autoscroll.js — 自動捲動
 *
 * 練琴時雙手都在吉他上，沒手滑手機。這是這個工具能不能取代紙本的關鍵。
 *
 * 純計算的部分抽成函式方便測試；副作用（rAF、Wake Lock）留在 hook 裡。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 速度檔位（px/秒），非線性：
 * 慢速區給 1 的增量（慢練時 2 跟 3 差很多），快速區才給大跳。
 * 18px 字級下一行約 41px，所以 2 px/s ≈ 每分鐘 3 行，60 ≈ 88 行。
 */
export const SPEED_LEVELS = [2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 18, 22, 26, 32, 40, 50, 60];
export const SPEED_MIN = SPEED_LEVELS[0];
export const SPEED_MAX = SPEED_LEVELS[SPEED_LEVELS.length - 1];
export const SPEED_DEFAULT = 12;

/** 把任意數值吸附到最近的檔位 */
export function snapSpeed(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return SPEED_DEFAULT;
  return SPEED_LEVELS.reduce((best, lv) => (Math.abs(lv - n) < Math.abs(best - n) ? lv : best), SPEED_LEVELS[0]);
}

/** 往上/下移動一格 */
export function stepSpeed(v, dir) {
  const i = SPEED_LEVELS.indexOf(snapSpeed(v));
  return SPEED_LEVELS[Math.min(SPEED_LEVELS.length - 1, Math.max(0, i + dir))];
}

/** 舊名保留，避免其他地方 import 壞掉 */
export const clampSpeed = snapSpeed;

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
  // 關鍵：位置存在自己的浮點累積器裡，不從 el.scrollTop 讀回來。
  // 20 px/s 在 60fps 下每幀只有 0.33px，瀏覽器把小數截掉後存進去是 0，
  // 下一幀再從 0 開始 —— 永遠累積不起來，畫面完全不動。
  const posRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    const el = ref.current;
    if (!el) return;

    posRef.current = el.scrollTop; // 從目前位置接手
    let raf;
    let last = performance.now();

    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.1); // 分頁切回來時 dt 會爆大，夾住
      last = now;

      // 使用者中途自己滑動 → 以他滑到的位置為準繼續捲，不要拉回去打架
      if (Math.abs(el.scrollTop - posRef.current) > 2) posRef.current = el.scrollTop;

      const max = maxScrollOf(el);
      posRef.current = nextScrollTop(posRef.current, speedRef.current, dt, max);
      el.scrollTop = posRef.current;

      if (posRef.current >= max - 1) { setPlaying(false); return; } // 到底自動停
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
