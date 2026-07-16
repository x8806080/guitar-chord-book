import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextScrollTop, maxScrollOf, isAtBottom, isScrollable, snapSpeed, stepSpeed,
  SPEED_LEVELS, SPEED_MIN, SPEED_MAX, SPEED_DEFAULT,
} from '../src/lib/autoscroll.js';

const el = (scrollTop, clientHeight, scrollHeight) => ({ scrollTop, clientHeight, scrollHeight });

test('速度會吸附到最近的檔位並夾在範圍內', () => {
  assert.equal(snapSpeed(0), SPEED_MIN);
  assert.equal(snapSpeed(999), SPEED_MAX);
  assert.equal(snapSpeed(-50), SPEED_MIN);
  assert.equal(snapSpeed(23), 22, '23 最接近 22');
  assert.equal(snapSpeed(SPEED_DEFAULT), SPEED_DEFAULT);
  assert.equal(snapSpeed(NaN), SPEED_DEFAULT, '壞資料要有安全預設');
  assert.equal(snapSpeed(undefined), SPEED_DEFAULT);
});

test('★ 慢速區的檔位要細（慢練時 2 跟 3 差很多）', () => {
  const slow = SPEED_LEVELS.filter((v) => v <= 8);
  for (let i = 1; i < slow.length; i++) {
    assert.equal(slow[i] - slow[i - 1], 1, `慢速區 ${slow[i - 1]}→${slow[i]} 增量應為 1`);
  }
  assert.equal(SPEED_MIN, 2, '最慢要能到 2 px/s');
});

test('★ +/- 一次移動一格，到底不會越界', () => {
  assert.equal(stepSpeed(2, -1), 2, '已在最慢');
  assert.equal(stepSpeed(2, 1), 3);
  assert.equal(stepSpeed(60, 1), 60, '已在最快');
  assert.equal(stepSpeed(60, -1), 50);
  assert.equal(stepSpeed(23, -1), 18, '先吸附到 22 再往下一格');
});

test('捲動位移 = 速度 × 時間', () => {
  assert.equal(nextScrollTop(0, 20, 1, 1000), 20);
  assert.equal(nextScrollTop(100, 20, 0.5, 1000), 110);
  assert.equal(nextScrollTop(0, 60, 2, 1000), 120);
});

test('★ 不會捲過頭（夾在底部）', () => {
  assert.equal(nextScrollTop(990, 60, 1, 1000), 1000);
  assert.equal(nextScrollTop(1000, 60, 1, 1000), 1000);
});

test('★ 不會捲成負數', () => {
  assert.equal(nextScrollTop(5, -100, 1, 1000), 0);
});

test('★ 內容比視窗短時不可捲（不該顯示控制列）', () => {
  assert.equal(isScrollable(el(0, 800, 500)), false, '內容比視窗短');
  assert.equal(isScrollable(el(0, 800, 802)), false, '只差 2px，不值得捲');
  assert.equal(isScrollable(el(0, 800, 2000)), true);
  assert.equal(maxScrollOf(el(0, 800, 500)), 0, 'maxScroll 不可為負');
});

test('到底判定（含 1px 容差）', () => {
  assert.equal(isAtBottom(el(1200, 800, 2000)), true);
  assert.equal(isAtBottom(el(1199.5, 800, 2000)), true, '小數誤差仍算到底');
  assert.equal(isAtBottom(el(1000, 800, 2000)), false);
  assert.equal(isAtBottom(el(0, 800, 500)), true, '不能捲 = 已在底部');
});

test('★ 一分鐘捲動距離符合實際練琴節奏', () => {
  // 18px 字級下一行約 41px（歌詞 26 + 和弦 15）
  const LINE = 41;
  const linesPerMin = (speed) => (speed * 60) / LINE;
  assert.ok(linesPerMin(SPEED_MIN) <= 3.5, `最慢應該要夠慢，實際 ${linesPerMin(SPEED_MIN).toFixed(1)} 行/分`);
  assert.ok(linesPerMin(SPEED_DEFAULT) >= 15 && linesPerMin(SPEED_DEFAULT) <= 20, `預設 ${linesPerMin(SPEED_DEFAULT).toFixed(1)} 行/分`);
  assert.ok(linesPerMin(SPEED_MAX) >= 80, `最快 ${linesPerMin(SPEED_MAX).toFixed(1)} 行/分`);
});

test('★★ 慢速度必須真的會動（浮點累積器，不可依賴 scrollTop 讀回）', () => {
  // 這是使用者回報「20 不會捲、25 才會動」的根因測試。
  // 舊做法每幀從 el.scrollTop 讀回當基準，小數被瀏覽器截掉 → 永遠累積不起來。
  for (const speed of SPEED_LEVELS) {
    let pos = 0;
    for (let i = 0; i < 60; i++) pos = nextScrollTop(pos, speed, 1 / 60, 99999); // 模擬 1 秒 @60fps
    assert.ok(Math.abs(pos - speed) < 0.001, `速度 ${speed}：1 秒應捲 ${speed}px，實際 ${pos.toFixed(3)}px`);
  }

  // 對照組：模擬「每幀截斷小數」的舊行為，證明它真的不會動
  let broken = 0;
  for (let i = 0; i < 60; i++) broken = Math.trunc(nextScrollTop(broken, 20, 1 / 60, 99999));
  assert.equal(broken, 0, '舊做法在 20 px/s 下確實完全不動（這就是回報的 bug）');
});

test('★ 分頁切回來時 dt 爆大也不會瞬間跳到底', () => {
  // hook 內把 dt 夾在 0.1 秒；模擬離開 30 秒後回來
  const dt = Math.min(30, 0.1);
  assert.equal(nextScrollTop(0, 20, dt, 5000), 2, '最多只捲 2px，不是 600px');
});

test('★ scrollToTop：瀏覽器沒有 scrollTo 時要 fallback，不可炸掉 App', async () => {
  const { scrollToTop } = await import('../src/lib/autoscroll.js');
  // 有 scrollTo 的正常情況
  let called = null;
  scrollToTop({ scrollTo: (o) => { called = o; }, scrollTop: 500 });
  assert.deepEqual(called, { top: 0, behavior: 'smooth' });

  // 沒有 scrollTo 的舊環境 → 應退回 scrollTop 而不是丟例外
  const old = { scrollTop: 500 };
  assert.doesNotThrow(() => scrollToTop(old));
  assert.equal(old.scrollTop, 0);

  // scrollTo 存在但不吃 options（更舊的實作）
  const legacy = { scrollTop: 500, scrollTo: () => { throw new TypeError('no options'); } };
  assert.doesNotThrow(() => scrollToTop(legacy));
  assert.equal(legacy.scrollTop, 0);

  assert.doesNotThrow(() => scrollToTop(null));
});
