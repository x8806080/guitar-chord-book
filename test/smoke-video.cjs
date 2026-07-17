const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://example.github.io/app/', pretendToBeVisual: true,
});
for (const k of ['window','document','navigator','localStorage','HTMLElement','Element','Node','getComputedStyle'])
  global[k] = k === 'window' ? dom.window : dom.window[k];
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const VideoPlayer = require('../.smoke/video.cjs').default;
const { parseYouTube } = require('../.smoke/yt.cjs');

const root = createRoot(document.getElementById('root'));
const render = async (video) => act(async () => {
  root.render(React.createElement(VideoPlayer, { video, title: '測試曲' }));
});
const click = async (el) => { if (!el) return false; await act(async () => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); return true; };

(async () => {
  const checks = [];
  const ok = (n, c, e = '') => checks.push([c, n, e]);

  // 沒有 {youtube:} 的歌，整塊不該出現
  await render(null);
  ok('★ 沒填連結時播放器不出現', document.getElementById('root').innerHTML === '');

  // 連結打錯 → parseYouTube 回 null → 一樣不出現，且不炸
  await render(parseYouTube('https://vimeo.com/12345'));
  ok('★ 連結打錯時安靜隱藏，不炸掉樂譜', document.getElementById('root').innerHTML === '');

  const video = parseYouTube('https://youtu.be/dQw4w9WgXcQ?t=90');
  await render(video);
  ok('起始時間有解析到', video.start === 90, `start=${video.start}`);
  ok('顯示「播放原曲」按鈕', document.body.textContent.includes('播放原曲'));
  ok('★ 按下播放前不載入 iframe（省流量、不被追蹤）',
     document.querySelectorAll('iframe').length === 0);

  const playBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('播放原曲'));
  await click(playBtn);
  const iframe = document.querySelector('iframe');
  ok('★ 按下後才載入 iframe', Boolean(iframe));
  ok('★ 用 youtube-nocookie 網域', iframe?.src.includes('youtube-nocookie.com'), iframe?.src.slice(0, 52));
  ok('★ 起始時間帶進播放器', iframe?.src.includes('start=90'));
  ok('自動播放（使用者已明確按下播放）', iframe?.src.includes('autoplay=1'));
  ok('iframe 有 title（無障礙）', Boolean(iframe?.getAttribute('title')));

  // 收起畫面時 iframe 不可被卸載，否則音樂會停
  const foldBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('收起畫面'));
  ok('有收起按鈕', Boolean(foldBtn));
  await click(foldBtn);
  ok('★★ 收起畫面後 iframe 仍在（音樂不中斷）',
     document.querySelectorAll('iframe').length === 1,
     `iframe 數量 ${document.querySelectorAll('iframe').length}`);
  ok('收起後可再展開', document.body.textContent.includes('展開畫面'));

  // ---- 換歌時不可自動播放（回報的 bug）----
  const other = parseYouTube('https://youtu.be/aaaaaaaaaaa');
  await render(other);
  ok('★★ 換歌後不可自動播放（要回到「播放原曲」按鈕）',
     document.querySelectorAll('iframe').length === 0 && document.body.textContent.includes('播放原曲'),
     `iframe 數量 ${document.querySelectorAll('iframe').length}`);

  // 換回原本那首，一樣不該自動播
  await render(video);
  ok('★★ 切回上一首也不可自動播放', document.querySelectorAll('iframe').length === 0);

  // 同一首歌重新 render（改字級、轉調、編輯歌詞）→ 音樂不可中斷
  const playBtn2 = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('播放原曲'));
  await click(playBtn2);
  ok('重新按播放可正常載入', document.querySelectorAll('iframe').length === 1);
  await render({ ...video });   // 同 id、新物件，模擬父層重新 render
  ok('★★ 同一首歌重新 render 時音樂不中斷', document.querySelectorAll('iframe').length === 1,
     `iframe 數量 ${document.querySelectorAll('iframe').length}`);

  let pass = 0;
  for (const [c, n, e] of checks) { console.log(`${c ? '✅' : '❌'} ${n}${e ? '  → ' + e : ''}`); if (c) pass++; }
  console.log(`\n${pass}/${checks.length} 通過`);
  process.exit(pass === checks.length ? 0 : 1);
})();
