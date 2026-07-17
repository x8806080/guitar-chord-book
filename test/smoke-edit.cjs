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
const SongSheet = require('../.smoke/sheet.cjs').default;
const { parseChordPro } = require('../.smoke/cp.cjs');

const click = async (el) => { if (!el) return false; await act(async () => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); return true; };
const type = async (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  await act(async () => el.dispatchEvent(new dom.window.Event('input', { bubbles: true })));
};
const key = async (el, k) => act(async () => el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true })));
const chordBtn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t && b.className.includes('sheet-chord'));

let source = '[C]Twinkle, [F]little [C]star';
const root = createRoot(document.getElementById('root'));

// 用真的 state 容器包住 —— 真實 App 裡 onSourceChange 會觸發父層 re-render 並傳入新 ast。
// 只更新變數而不重新 render，等於在測一個不存在的假世界。
let setSourceExternal = null;
function Harness({ initial, ...props }) {
  const [src, setSrc] = React.useState(initial);
  setSourceExternal = setSrc;
  source = src;
  return React.createElement(SongSheet, {
    ast: parseChordPro(src), semitones: 0, useFlat: false, fontSize: 18, showChords: false,
    editable: true, onSourceChange: setSrc, ...props,
  });
}

const render = async (over = {}) => act(async () => {
  root.render(React.createElement(Harness, { initial: source, ...over }));
});
const reset = async (src, over = {}) => {
  await act(async () => root.render(null));   // 換題目時整個重來，避免 state 殘留
  source = src;
  await render(over);
};

(async () => {
  const checks = [];
  const ok = (n, c, e = '') => checks.push([c, n, e]);

  // ---- 鎖定狀態 ----
  await reset('[C]Twinkle, [F]little [C]star', { editable: false });
  ok('★ 鎖定時和弦不可點（練琴不會誤觸）',
     [...document.querySelectorAll('button')].filter((b) => b.className.includes('sheet-chord')).length === 0);
  ok('鎖定時和弦仍正常顯示', document.body.textContent.includes('Twinkle'));

  // ---- 解鎖 ----
  await reset('[C]Twinkle, [F]little [C]star');
  ok('★ 解鎖後和弦變成可點', Boolean(chordBtn('F')));

  await click(chordBtn('F'));
  ok('★ 點和弦會跳出編輯框', Boolean(document.querySelector('[role="dialog"]')));
  const input = document.querySelector('[role="dialog"] input');
  ok('編輯框帶入目前和弦', input?.value === 'F', `實際 "${input?.value}"`);

  // ---- 改和弦 ----
  await type(input, 'Am7');
  await key(input, 'Enter');
  ok('★★ 改和弦只動那一個，其他不變', source === '[C]Twinkle, [Am7]little [C]star', source);

  // ---- 移動 ----
  await click(chordBtn('Am7'));
  await click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.getAttribute('aria-label') === '往右移一個字'));
  ok('★★ 右移一個字', source === '[C]Twinkle, l[Am7]ittle [C]star', source);
  ok('★ 移動後編輯框還在（可連續按）', Boolean(document.querySelector('[role="dialog"]')));

  await click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.getAttribute('aria-label') === '往左移一個字'));
  ok('★ 左移回去', source === '[C]Twinkle, [Am7]little [C]star', source);

  // ---- 鍵盤方向鍵移動 ----
  await reset('[C]Twinkle, [F]little [C]star');
  await click(chordBtn('F'));
  const kin = document.querySelector('[role="dialog"] input');
  ok('★ 剛點開和弦時輸入框是全選狀態',
     kin.selectionStart === 0 && kin.selectionEnd === kin.value.length,
     `sel ${kin.selectionStart}..${kin.selectionEnd} / len ${kin.value.length}`);

  await key(kin, 'ArrowRight');
  ok('★★ 全選狀態按 → 直接搬和弦', source === '[C]Twinkle, l[F]ittle [C]star', source);

  const kin2 = document.querySelector('[role="dialog"] input');
  await key(kin2, 'ArrowRight');
  ok('★★ 可連按（搬完仍保持全選）', source === '[C]Twinkle, li[F]ttle [C]star', source);

  const kin3 = document.querySelector('[role="dialog"] input');
  await key(kin3, 'ArrowLeft');
  ok('★★ 按 ← 搬回去', source === '[C]Twinkle, l[F]ittle [C]star', source);

  // 開始打字後就不再是全選，方向鍵必須回歸游標移動
  const kin4 = document.querySelector('[role="dialog"] input');
  await type(kin4, 'Am');
  ok('★ 打字後不再是全選', !(kin4.selectionStart === 0 && kin4.selectionEnd === kin4.value.length));
  const before = source;
  await key(kin4, 'ArrowLeft');
  ok('★★ 編輯文字中按方向鍵不可搬和弦（不然沒法改字）', source === before, source);

  ok('★ 編輯框上有提示方向鍵可用', document.body.textContent.includes('← → 移動'));
  await key(kin4, 'Escape');

  // ---- 刪除 ----
  await reset('[C]Twinkle, [Am7]little [C]star');
  await click(chordBtn('Am7'));
  await click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.getAttribute('aria-label') === '刪除這個和弦'));
  ok('★★ 刪和弦不會動到歌詞', source === '[C]Twinkle, little [C]star', source);

  // ---- 插入 ----
  const plus = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '＋');
  ok('★ 沒和弦的字上方有插入鈕', Boolean(plus));
  await click(plus);
  ok('★★ 插入和弦不會動到歌詞',
     source.replace(/\[[^\]]*\]/g, '') === 'Twinkle, little star', source);

  // ---- Esc 取消 ----
  await reset('[C]Twinkle, [F]little [C]star');
  await click(chordBtn('F'));
  const inp2 = document.querySelector('[role="dialog"] input');
  await type(inp2, 'XXX');
  await key(inp2, 'Escape');
  ok('★★ Esc 取消不可寫入', source === '[C]Twinkle, [F]little [C]star', source);
  ok('Esc 後編輯框關閉', !document.querySelector('[role="dialog"]'));

  // ---- 轉調狀態下編輯 ----
  await reset('[C]Twinkle, [F]little [C]star', { semitones: 2 });
  ok('★ 轉調後畫面顯示移調值', Boolean(chordBtn('G')), '+2 之後 F 應顯示成 G');
  await click(chordBtn('G'));
  ok('★ 轉調中會提示原調會存成什麼', document.body.textContent.includes('原調存成'));
  const inp3 = document.querySelector('[role="dialog"] input');
  await type(inp3, 'Em');
  await key(inp3, 'Enter');
  ok('★★ 轉調中編輯必須反向轉調寫回原調',
     source === '[C]Twinkle, [Dm]little [C]star', `實際 ${source}（Em 移調 -2 應為 Dm）`);

  let pass = 0;
  for (const [c, n, e] of checks) { console.log(`${c ? '✅' : '❌'} ${n}${e ? '  → ' + e : ''}`); if (c) pass++; }
  console.log(`\n${pass}/${checks.length} 通過`);
  process.exit(pass === checks.length ? 0 : 1);
})();
