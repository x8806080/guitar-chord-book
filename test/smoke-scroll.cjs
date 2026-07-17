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
const ScrollControl = require('../.smoke/scroll.cjs').default;

const click = async (el) => act(async () => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
const btn = (label) => [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label);

let state = { playing: false, speed: 20, topCalled: 0 };
const root = createRoot(document.getElementById('root'));

const render = async (over = {}) => {
  Object.assign(state, over);
  await act(async () => {
    root.render(React.createElement(ScrollControl, {
      visible: true,
      playing: state.playing,
      speed: state.speed,
      onToggle: () => { state.playing = !state.playing; },
      onSpeed: (v) => { state.speed = v; },
      onTop: () => { state.topCalled++; },
    }));
  });
};

(async () => {
  const checks = [];
  const ok = (n, c, e = '') => checks.push([c, n, e]);

  await render();
  ok('控制列有渲染', Boolean(btn('開始捲動')));
  ok('★ 播放鍵夠大（48px，雙手在吉他上時不用瞄準）',
     btn('開始捲動').className.includes('h-12') && btn('開始捲動').className.includes('w-12'));
  ok('顯示目前速度', document.body.textContent.includes('20'));

  await click(btn('開始捲動'));
  ok('★ 按播放會觸發 onToggle', state.playing === true);

  await render({ playing: true });
  ok('播放中變成暫停鍵', Boolean(btn('暫停捲動')));
  ok('★ 播放中控制列變半透明（不擋歌詞）',
     document.querySelector('div[class*="opacity-40"]') !== null);

  await click(btn('捲快一點'));
  ok('★ 加速一次移動一格（20→22）', state.speed === 22, `實際 ${state.speed}`);

  await render({ speed: 22 });
  await click(btn('捲慢一點'));
  ok('★ 減速一次移動一格（22→18）', state.speed === 18, `實際 ${state.speed}`);

  // 慢速區必須細緻：3 往下一格是 2，不是一次掉 5
  await render({ speed: 3 });
  await click(btn('捲慢一點'));
  ok('★★ 慢速區一次只降 1（3→2，慢練用得到）', state.speed === 2, `實際 ${state.speed}`);

  await render({ speed: 60 });
  ok('★ 到最快時加速鍵停用', btn('捲快一點').disabled);
  await render({ speed: 2 });
  ok('★ 到最慢時減速鍵停用（最慢是 2 不是 5）', btn('捲慢一點').disabled);

  await render({ speed: 20 });
  await click(btn('回到開頭'));
  ok('★ 回到開頭鍵可用', state.topCalled === 1);

  // 內容不夠長時不該出現控制列
  await act(async () => {
    root.render(React.createElement(ScrollControl, {
      visible: false, playing: false, speed: 20, onToggle(){}, onSpeed(){}, onTop(){},
    }));
  });
  ok('★ 內容短到不用捲時，控制列不出現', document.getElementById('root').innerHTML === '');

  let pass = 0;
  for (const [c, n, e] of checks) { console.log(`${c ? '✅' : '❌'} ${n}${e ? '  → ' + e : ''}`); if (c) pass++; }
  console.log(`\n${pass}/${checks.length} 通過`);
  process.exit(pass === checks.length ? 0 : 1);
})();
