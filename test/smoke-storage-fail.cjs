/**
 * 儲存不可用時（無痕模式、隱私設定、容量滿）App 的行為。
 *
 * 守兩件事：
 *  1. 絕不可白畫面 —— 儲存失敗會拋錯，若在 useState 初始化時拋出會整個 App 掛掉
 *  2. 絕不可靜默 —— 必須明講「資料不會被保留」，否則使用者白做工到重新整理才發現
 */
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://example.github.io/app/', pretendToBeVisual: true,
});
for (const k of ['window','document','navigator','HTMLElement','Element','Node','getComputedStyle'])
  global[k] = k === 'window' ? dom.window : dom.window[k];

// 模擬寫入無效的瀏覽器
const store = {};
const brokenLS = {
  getItem: (k) => store[k] ?? null,
  setItem: () => { const e = new Error('SecurityError'); e.name = 'SecurityError'; throw e; },
  removeItem: (k) => { delete store[k]; },
};
global.localStorage = brokenLS;
Object.defineProperty(dom.window, 'localStorage', { value: brokenLS, configurable: true });

global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const App = require('../.smoke/app.cjs').default;

const root = createRoot(document.getElementById('root'));

(async () => {
  const checks = [];
  const ok = (n, c, e = '') => checks.push([c, n, e]);

  let crashed = null;
  const origErr = console.error;
  console.error = () => {};
  try {
    await act(async () => root.render(React.createElement(App)));
  } catch (e) {
    crashed = e;
  }
  console.error = origErr;

  ok('★★ 儲存壞掉時 App 不可整個掛掉', !crashed, crashed?.message);
  ok('★★ 不可白畫面', document.getElementById('root').innerHTML.length > 200,
     `innerHTML 長度 ${document.getElementById('root').innerHTML.length}`);
  ok('★★ 必須明講資料不會被保留', /無法儲存|無痕|不會被保留|消失/.test(document.body.textContent));

  const addBtn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '新增歌曲');
  ok('介面仍可操作（找得到新增鈕）', Boolean(addBtn));
  if (addBtn) {
    await act(async () => addBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
    ok('★★ 新增失敗要明講，不可只出現在畫面上',
       /失敗|沒有存|無法寫入|不會被保留/.test(document.body.textContent),
       '靜默失敗 = 使用者要等到重新整理才發現資料不見');
  }

  let pass = 0;
  for (const [c, n, e] of checks) { console.log(`${c ? '✅' : '❌'} ${n}${e ? '  → ' + e : ''}`); if (c) pass++; }
  console.log(`\n${pass}/${checks.length} 通過`);
  process.exit(pass === checks.length ? 0 : 1);
})();
