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
  if (!el) return false; // 測試腳本自己也要容錯，否則 bug 存在時只會看到 crash
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  await act(async () => el.dispatchEvent(new dom.window.Event('input', { bubbles: true })));
  return true;
};
const key = async (el, k) => {
  if (!el) return false;
  await act(async () => el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true })));
  return true;
};
const chordBtn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t && b.className.includes('sheet-chord'));
const editorInput = () => document.querySelector('input[aria-label="和弦名稱"]');

// 模擬指標事件（jsdom 沒有 PointerEvent，用 MouseEvent 帶上必要欄位）
const ptr = (type, x, y, target) => {
  const ev = new dom.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  (target || dom.window).dispatchEvent(ev);
};
const pointerDown = async (el, x, y) => act(async () => {
  const ev = new dom.window.MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  el.dispatchEvent(ev);
});
const pointerMove = async (x, y) => act(async () => ptr('pointermove', x, y));
const pointerUp = async (x, y) => act(async () => ptr('pointerup', x, y));

/**
 * 點一下和弦。
 * 和弦按鈕走的是 pointerdown/pointerup 拖曳狀態機（要能區分點擊與拖曳），
 * 所以不能只送 click —— 真人點擊會產生完整的 pointerdown → pointerup 序列。
 */
const tap = async (el) => {
  if (!el) return false;
  await pointerDown(el, 100, 50);
  await pointerUp(100, 50);
  return true;
};

let source = '[C]Twinkle, [F]little [C]star';
let lastHighlight = null;
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
    editable: true, onSourceChange: setSrc, onHighlight: (h) => { lastHighlight = h; }, ...props,
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

  await tap(chordBtn('F'));
  ok('★★ 點和弦直接就地變成輸入框（不彈窗）', Boolean(editorInput()));
  ok('★★ 不可出現浮動窗格', !document.querySelector('[role="dialog"]'));
  const input = editorInput();
  ok('編輯框帶入目前和弦', input?.value === 'F', `實際 "${input?.value}"`);

  // ---- 改和弦 ----
  await type(input, 'Am7');
  await key(input, 'Enter');
  ok('★★ 改和弦只動那一個，其他不變', source === '[C]Twinkle, [Am7]little [C]star', source);

  // ---- 移動 ----
  await tap(chordBtn('Am7'));
  await click([...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '往右移一個字'));
  ok('★★ 右移一個字', source === '[C]Twinkle, l[Am7]ittle [C]star', source);
  ok('★ 移動後編輯框還在（可連續按）', Boolean(editorInput()));

  await click([...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '往左移一個字'));
  ok('★ 左移回去', source === '[C]Twinkle, [Am7]little [C]star', source);

  // ---- 鍵盤方向鍵移動 ----
  await reset('[C]Twinkle, [F]little [C]star');
  await tap(chordBtn('F'));
  const kin = editorInput();
  ok('★ 剛點開和弦時輸入框是全選狀態',
     Boolean(kin) && kin.selectionStart === 0 && kin.selectionEnd === kin.value.length,
     kin ? `sel ${kin.selectionStart}..${kin.selectionEnd} / len ${kin.value.length}` : '找不到輸入框');

  await key(kin, 'ArrowRight');
  ok('★★ 全選狀態按 → 直接搬和弦', source === '[C]Twinkle, l[F]ittle [C]star', source);

  const kin2 = editorInput();
  await key(kin2, 'ArrowRight');
  ok('★★ 可連按（搬完仍保持全選）', source === '[C]Twinkle, li[F]ttle [C]star', source);

  const kin3 = editorInput();
  await key(kin3, 'ArrowLeft');
  ok('★★ 按 ← 搬回去', source === '[C]Twinkle, l[F]ittle [C]star', source);

  // 開始打字後就不再是全選，方向鍵必須回歸游標移動
  const kin4 = editorInput();
  await type(kin4, 'Am');
  ok('★ 打字後不再是全選', Boolean(kin4) && !(kin4.selectionStart === 0 && kin4.selectionEnd === kin4.value.length));
  const before = source;
  await key(kin4, 'ArrowLeft');
  ok('★★ 編輯文字中按方向鍵不可搬和弦（不然沒法改字）', source === before, source);

  // 就地編輯版用實體圖示取代文字提示，比文字直觀，手機也才有得按
  ok('★★ 編輯框有 ← → 圖示（手機沒有實體方向鍵，這是唯一的搬移方式）',
     [...document.querySelectorAll('button')].some((b) => b.getAttribute('aria-label') === '往左移一個字') &&
     [...document.querySelectorAll('button')].some((b) => b.getAttribute('aria-label') === '往右移一個字'));
  ok('★★ 編輯框有刪除圖示（手機沒有 Del 鍵）',
     [...document.querySelectorAll('button')].some((b) => b.getAttribute('aria-label') === '刪除這個和弦'));
  await key(kin4, 'Escape');

  // ---- 刪除 ----
  await reset('[C]Twinkle, [Am7]little [C]star');
  await tap(chordBtn('Am7'));
  await click([...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '刪除這個和弦'));
  ok('★★ 刪和弦不會動到歌詞', source === '[C]Twinkle, little [C]star', source);

  // ---- 插入 ----
  const plus = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '＋');
  ok('★ 沒和弦的字上方有插入鈕', Boolean(plus));
  await click(plus);
  ok('★★ 按＋也是就地變輸入框（不彈窗）', Boolean(editorInput()) && !document.querySelector('[role="dialog"]'));
  const ins = editorInput();
  await type(ins, 'Dm');
  await key(ins, 'Enter');
  ok('★★ 插入的是使用者輸入的和弦，不是寫死的 C', source.includes('[Dm]'), source);
  ok('★★ 插入不會動到歌詞',
     source.replace(/\[[^\]]*\]/g, '') === 'Twinkle, little star', source);

  // ---- Esc 取消 ----
  await reset('[C]Twinkle, [F]little [C]star');
  await tap(chordBtn('F'));
  const inp2 = editorInput();
  await type(inp2, 'XXX');
  await key(inp2, 'Escape');
  ok('★★ Esc 取消不可寫入', source === '[C]Twinkle, [F]little [C]star', source);
  ok('Esc 後編輯框關閉', !editorInput());

  // ---- 轉調狀態下編輯 ----
  await reset('[C]Twinkle, [F]little [C]star', { semitones: 2 });
  ok('★ 轉調後畫面顯示移調值', Boolean(chordBtn('G')), '+2 之後 F 應顯示成 G');
  await tap(chordBtn('G'));
  ok('★ 轉調中會提示原調會存成什麼', document.body.textContent.includes('原調存成'));
  const inp3 = editorInput();
  await type(inp3, 'Em');
  await key(inp3, 'Enter');
  ok('★★ 轉調中編輯必須反向轉調寫回原調',
     source === '[C]Twinkle, [Dm]little [C]star', `實際 ${source}（Em 移調 -2 應為 Dm）`);

  // ---- Del 鍵刪除 ----
  await reset('[C]Twinkle, [F]little [C]star');
  await tap(chordBtn('F'));
  const din = editorInput();
  await key(din, 'Delete');
  ok('★★ 全選狀態按 Del 刪除整個和弦', source === '[C]Twinkle, little [C]star', source);

  await reset('[C]Twinkle, [F]little [C]star');
  await tap(chordBtn('F'));
  const din2 = editorInput();
  await key(din2, 'Backspace');
  ok('★★ 全選狀態按 Backspace 也刪除和弦', source === '[C]Twinkle, little [C]star', source);

  // 編輯文字中按 Del 必須是刪字元，不能整個和弦不見
  await reset('[C]Twinkle, [F]little [C]star');
  await tap(chordBtn('F'));
  const din3 = editorInput();
  await type(din3, 'Am7');
  const beforeDel = source;
  await key(din3, 'Backspace');
  ok('★★ 編輯文字中按 Backspace 不可刪掉整個和弦', source === beforeDel, source);

  // ---- 滑鼠 / 觸控拖曳 ----
  await reset('[C]Twinkle, [F]little [C]star');
  const dragBtn = chordBtn('F');
  ok('★ 和弦有 grab 游標提示可拖曳', Boolean(dragBtn?.className.includes('cursor-grab')));
  ok('★★ 觸控時保留垂直捲動（touch-action: pan-y），否則手機碰到和弦就捲不動頁面',
     dragBtn?.style.touchAction === 'pan-y', `實際 "${dragBtn?.style.touchAction}"`);

  // 拖曳：按下 → 移動超過門檻 → 放到目標字上
  const targets = [...document.querySelectorAll('[data-pos]')];
  ok('★ 每個字都有落點座標', targets.length > 3, `共 ${targets.length} 個`);
  const targetUnit = targets.find((t) => t.textContent.includes('star'));
  dom.window.document.elementFromPoint = () => targetUnit; // jsdom 沒有真實排版，直接指定命中目標

  await pointerDown(dragBtn, 100, 50);
  await pointerMove(140, 50); // 超過 6px 門檻
  ok('★ 拖曳中原和弦變半透明', dragBtn?.style.opacity === '0.35', `opacity=${dragBtn?.style.opacity}`);
  await pointerUp(140, 50);
  ok('★★ 拖曳可把和弦搬到目標字上', source === '[C]Twinkle, little [C][F]star', source);

  // 沒超過門檻 = 點擊，不是拖曳
  await reset('[C]Twinkle, [F]little [C]star');
  const tapBtn = chordBtn('F');
  await pointerDown(tapBtn, 100, 50);
  await pointerMove(102, 51); // 只動 2px
  await pointerUp(102, 51);
  ok('★★ 微小位移視為點擊，要開編輯框而不是搬和弦',
     Boolean(editorInput()) && source === '[C]Twinkle, [F]little [C]star', source);

  // ---- 歌詞就地編輯 ----
  await reset('[C]Twinkle, [F]little [C]star');
  const lyricBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'little');
  ok('★ 解鎖後歌詞可點', Boolean(lyricBtn));
  await click(lyricBtn);
  const lin = document.querySelector('input[aria-label="歌詞"]');
  ok('★★ 點歌詞就地變輸入框', Boolean(lin), '找不到歌詞輸入框');
  ok('歌詞輸入框帶入原文字', lin?.value === 'little', `實際 "${lin?.value}"`);

  await type(lin, 'shining');
  await key(lin, 'Enter');
  ok('★★ 改歌詞不可動到和弦', source === '[C]Twinkle, [F]shining [C]star', source);

  // 空白不該可編輯（點了沒意義）
  await reset('[C]Twinkle, [F]little [C]star');
  const spaceBtns = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '' && b.className.includes('sheet-lyric'));
  ok('★ 純空白不做成可點的歌詞', spaceBtns.length === 0, `有 ${spaceBtns.length} 個`);

  // 歌詞裡打方括號會被轉全形，不可產生假和弦
  await reset('[C]abc [F]def');
  await click([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'abc'));
  const lin2 = document.querySelector('input[aria-label="歌詞"]');
  await type(lin2, 'a[G]b');
  await key(lin2, 'Enter');
  ok('★★ 歌詞裡打方括號不可變成假和弦', !source.includes('[G]'), source);

  // ---- 編輯器同步反色 ----
  await reset('[C]Twinkle, [F]little [C]star');
  lastHighlight = null;
  await tap(chordBtn('F'));
  ok('★★ 點和弦要回報原始碼範圍給編輯器',
     lastHighlight && source.slice(lastHighlight.start, lastHighlight.end) === '[F]',
     JSON.stringify(lastHighlight));

  await reset('[C]Twinkle, [F]little [C]star');
  lastHighlight = null;
  await click([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'little'));
  ok('★★ 點歌詞要回報歌詞的原始碼範圍',
     lastHighlight && source.slice(lastHighlight.start, lastHighlight.end) === 'little',
     JSON.stringify(lastHighlight));

  await reset('[C]Twinkle, [F]little [C]star');
  await tap(chordBtn('F'));
  lastHighlight = 'unset';
  await act(async () => document.querySelector('article').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  ok('★ 關閉編輯時要清掉反色', lastHighlight === null, JSON.stringify(lastHighlight));

  let pass = 0;
  for (const [c, n, e] of checks) { console.log(`${c ? '✅' : '❌'} ${n}${e ? '  → ' + e : ''}`); if (c) pass++; }
  console.log(`\n${pass}/${checks.length} 通過`);
  process.exit(pass === checks.length ? 0 : 1);
})();
