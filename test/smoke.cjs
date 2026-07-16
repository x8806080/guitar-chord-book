/**
 * smoke.cjs — 在真實 DOM（jsdom）裡把 App 掛起來跑
 * 目的：抓「build 會過、但一執行就炸」的錯（TDZ、undefined import、effect 內錯誤）
 */
const { JSDOM } = require('/home/claude/guitar-chord-book/node_modules/jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://x8806080.github.io/guitar-chord-book/',
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.localStorage = dom.window.localStorage;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;

// 沒設定同步時，App 不該打任何網路
let fetchCalls = 0;
global.fetch = async (...a) => { fetchCalls++; throw new Error('unexpected fetch: ' + a[0]); };

const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };

const React = require('/home/claude/guitar-chord-book/node_modules/react');
const { createRoot } = require('/home/claude/guitar-chord-book/node_modules/react-dom/client');
const { act } = React;
const App = require('/home/claude/guitar-chord-book/.smoke/app.cjs').default;

(async () => {
  const root = createRoot(document.getElementById('root'));
  let fatal = null;
  try {
    await act(async () => { root.render(React.createElement(App)); });
  } catch (e) {
    fatal = e;
  }

  console.error = origErr;
  const html = document.getElementById('root').innerHTML;

  const checks = [];
  const ok = (name, cond, extra = '') => checks.push([cond ? 'PASS' : 'FAIL', name, extra]);

  ok('App 掛載沒有丟出例外', !fatal, fatal ? fatal.message : '');
  ok('#root 不是空的（不是黑畫面）', html.length > 500, `innerHTML 長度 ${html.length}`);
  ok('沒有 React 錯誤', errors.filter((e) => !/not wrapped in act|useLayoutEffect/i.test(e)).length === 0,
     errors.slice(0, 2).join(' | '));
  ok('渲染出範例歌曲標題', html.includes('Twinkle'));
  ok('渲染出和弦（轉調引擎有跑）', html.includes('sheet-chord'));
  ok('未設定同步時不打網路', fetchCalls === 0, `fetch 被呼叫 ${fetchCalls} 次`);
  ok('雲朵按鈕存在', html.includes('裝置同步'));

  let pass = 0;
  for (const [s, n, e] of checks) {
    console.log(`${s === 'PASS' ? '✅' : '❌'} ${n}${e ? '  → ' + e : ''}`);
    if (s === 'PASS') pass++;
  }
  console.log(`\n${pass}/${checks.length} 通過`);
  process.exit(pass === checks.length ? 0 : 1);
})();
