// 重現「編輯跳回」：controlled textarea 在上層 state 被同步舊值覆蓋時會跳回。
// 這裡直接測那個保護邏輯：同步寫回時，較新的本機版本必須留住。
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://example.github.io/app/', pretendToBeVisual: true });
for (const k of ['window','document','navigator','localStorage','HTMLElement','Element','Node','getComputedStyle']) global[k] = k === 'window' ? dom.window : dom.window[k];
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act, useState } = React;
const { createRoot } = require('react-dom/client');
const Editor = require('../.smoke/editor.cjs').default;

const type = async (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(el, v);
  await act(async () => el.dispatchEvent(new dom.window.Event('input', { bubbles: true })));
};

// 這個 harness 複製 App 的核心資料流：controlled Editor + 一個「同步寫回」函式
let songs = [{ id: 'a', source: 'orig', updatedAt: '2026-07-18T12:00:00Z' }];
let patchActive, syncWriteBack;

function App() {
  const [list, setList] = useState(songs);
  const active = list.find((s) => s.id === 'a');

  patchActive = (patch) => {
    const stamped = { ...patch, updatedAt: new Date().toISOString() };
    setList((prev) => prev.map((s) => (s.id === 'a' ? { ...s, ...stamped } : s)));
  };

  // 模擬 runSync 的寫回：帶著同步當下的舊快照回來
  syncWriteBack = (snapshot) => {
    setList((live) => snapshot.map((s) => {
      const cur = live.find((x) => x.id === s.id);
      return cur && (cur.updatedAt || '') > (s.updatedAt || '') ? cur : s;
    }));
  };

  return React.createElement(Editor, { value: active.source, onChange: (v) => patchActive({ source: v }) });
}

const root = createRoot(document.getElementById('root'));
const ta = () => document.querySelector('textarea');

(async () => {
  const checks = [];
  const ok = (n, c, e = '') => checks.push([c, n, e]);

  await act(async () => root.render(React.createElement(App)));
  ok('初始內容', ta().value === 'orig');

  // 使用者打字
  await type(ta(), '我正在打一長串新歌詞內容');
  ok('★ 打字後畫面更新', ta().value === '我正在打一長串新歌詞內容');

  // 關鍵：同步在打字之後回來，帶著「同步開始那一刻」的舊快照
  const staleSnapshot = [{ id: 'a', source: 'orig', updatedAt: '2026-07-18T11:59:00Z' }];
  await act(async () => syncWriteBack(staleSnapshot));
  ok('★★ 同步回來後，剛打的字不可跳回舊內容',
     ta().value === '我正在打一長串新歌詞內容',
     `實際變成 "${ta().value}"`);

  // 反面：其他裝置的較新版本要能覆蓋
  const newerFromOtherDevice = [{ id: 'a', source: '另一台裝置改的內容', updatedAt: '2030-01-01T00:00:00Z' }];
  await act(async () => syncWriteBack(newerFromOtherDevice));
  ok('★★ 但其他裝置真正較新的版本要能拉下來',
     ta().value === '另一台裝置改的內容', `實際 "${ta().value}"`);

  let pass = 0;
  for (const [c, n, e] of checks) { console.log(`${c ? '✅' : '❌'} ${n}${e ? '  → ' + e : ''}`); if (c) pass++; }
  console.log(`\n${pass}/${checks.length} 通過`);
  process.exit(pass === checks.length ? 0 : 1);
})();
