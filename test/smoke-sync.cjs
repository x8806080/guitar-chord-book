/**
 * smoke-sync.cjs — 模擬使用者在同步設定面板打字，檢查按鈕是否正確啟用
 */
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://example.github.io/app/',
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
global.IS_REACT_ACT_ENVIRONMENT = true;
global.fetch = async () => { throw new Error('no network'); };

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const SyncSettings = require('../.smoke/sync.cjs').default;

// 在受控元件裡塞值，必須用原生 setter 再派發 input 事件，React 才會收到 onChange
const type = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  await act(async () => {
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
};

const { SYNC_DEFAULTS } = require('../.smoke/config.cjs');
const cfg = { token: '', ...SYNC_DEFAULTS, sha: null, lastSync: null };

let savedCfg = null;

(async () => {
  const root = createRoot(document.getElementById('root'));
  await act(async () => {
    root.render(React.createElement(SyncSettings, {
      config: cfg, status: cfg,
      onSave: (v) => { savedCfg = v; }, onClear: () => {}, onSyncNow: () => {}, onClose: () => {},
    }));
  });

  const btns = [...document.querySelectorAll('button')];
  const testBtn = btns.find((b) => b.textContent.includes('測試連線'));
  const saveBtn = btns.find((b) => b.textContent.includes('儲存設定'));
  const tok = document.getElementById('tok');
  const own = document.getElementById('own');
  const rep = document.getElementById('rep');
  const pth = document.getElementById('pth');
  const brc = document.getElementById('brc');

  const checks = [];
  const ok = (n, c, e = '') => checks.push([c, n, e]);

  ok('面板有渲染出來', Boolean(testBtn && saveBtn && tok && own && rep));
  ok('按鈕不是死的', !testBtn.disabled && !saveBtn.disabled);
  ok('★ owner 已自動帶入，不用手打', own.value === SYNC_DEFAULTS.owner, `實際: "${own.value}"`);
  ok('★ repo 已自動帶入，不用手打', rep.value === SYNC_DEFAULTS.repo, `實際: "${rep.value}"`);
  ok('★ 同步目標有顯示在面板上', document.body.textContent.includes(`${SYNC_DEFAULTS.owner}/${SYNC_DEFAULTS.repo}`));
  ok('★ 進階欄位預設收起來（面板只剩 token 要填）', Boolean(document.querySelector('details:not([open])')));

  // 只差 token 時按下去，提示要專指 token
  await act(async () => { saveBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  const warn1 = document.body.textContent;
  ok('★ 只差 token 時，提示要專指 Token', warn1.includes('還沒貼上 Token'),
     (warn1.match(/還沒[^（]*/) || ['(沒有提示)'])[0]);
  ok('★ 會自動 focus 到 token 欄位', document.activeElement?.id === 'tok',
     `focus 在 #${document.activeElement?.id}`);
  ok('path 預設值有帶入', pth.value === 'songs.json', `實際: "${pth.value}"`);
  ok('branch 預設值有帶入', brc.value === 'main', `實際: "${brc.value}"`);

  // 模擬使用者依序填入三個必填欄位
  // ★ 核心情境：只貼 token，其他都不用碰
  await type(tok, 'github_pat_11FAKEFAKE0FAKEFAKEFAKEFAKE');
  ok('打完 token 後，值有進 state', tok.value.length > 10, `實際: "${tok.value}"`);

  await act(async () => { saveBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  ok('★★ 只貼 token 就能存檔，不該再喊缺東西', !document.body.textContent.includes('還沒'),
     (document.body.textContent.match(/還沒[^（]*/) || ['(無提示，正確)'])[0]);
  ok('★★ onSave 有真的被呼叫', savedCfg !== null, savedCfg ? `token 長度 ${savedCfg.token.length}` : '沒被呼叫');
  ok('★★ 存下去的 owner/repo 是預設值',
     savedCfg?.owner === SYNC_DEFAULTS.owner && savedCfg?.repo === SYNC_DEFAULTS.repo,
     savedCfg ? `${savedCfg.owner}/${savedCfg.repo}` : '-');

  // token 前後空白（從網頁複製很常見）
  await type(tok, '  github_pat_11FAKEFAKE0FAKEFAKEFAKEFAKE  ');
  await act(async () => { saveBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  ok('★ token 前後有空白也能存（貼上常見）', savedCfg?.token.startsWith('github_pat_'),
     savedCfg ? JSON.stringify(savedCfg.token) : '-');

  // 進階欄位若被清空，要提示並自動展開
  await type(own, '');
  await act(async () => { saveBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  ok('★ 進階欄位被清空時會提示', document.body.textContent.includes('帳號'));
  ok('★ 缺的是進階欄位時，details 會自動展開', Boolean(document.querySelector('details[open]')));

  // placeholder 不可與真值混淆：必須有「例：」前綴
  ok('★ placeholder 有「例：」前綴，不會被誤認為已填值',
     [tok, own, rep].every((el) => el.placeholder.startsWith('例：')),
     [tok, own, rep].map((el) => el.placeholder).join(' / '));

  let pass = 0;
  for (const [c, n, e] of checks) {
    console.log(`${c ? '✅' : '❌'} ${n}${e ? '  → ' + e : ''}`);
    if (c) pass++;
  }
  console.log(`\n${pass}/${checks.length} 通過`);
  process.exit(pass === checks.length ? 0 : 1);
})();
