const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://example.github.io/app/', pretendToBeVisual: true,
});
for (const k of ['window','document','navigator','localStorage','HTMLElement','Element','Node','SVGElement','getComputedStyle'])
  global[k] = k === 'window' ? dom.window : dom.window[k];
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const { ChordCard } = require('../.smoke/diagram.cjs');
const custom = require('../.smoke/custom.cjs');

const click = async (el) => { if (!el) return false; await act(async () => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); return true; };
const svgClick = async (el) => { if (!el) return false; await act(async () => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); return true; };
const byLabel = (l) => [...document.querySelectorAll('button, [aria-label]')].find((b) => b.getAttribute('aria-label') === l);
const setVal = (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(v));
  return act(async () => el.dispatchEvent(new dom.window.Event('input', { bubbles: true })));
};

let ver = 0;
const root = createRoot(document.getElementById('root'));
const render = async () => act(async () => {
  root.render(React.createElement(ChordCard, {
    name: 'C', editable: true, customVersion: ver,
    onCustomChange: (action, name, shape) => {
      if (action === 'save') custom.saveCustomShape(name, shape);
      if (action === 'delete') custom.deleteCustomShape(name);
      ver++;
    },
  }));
});

(async () => {
  const checks = [];
  const ok = (n, c, e = '') => checks.push([c, n, e]);
  Object.keys(dom.window.localStorage).forEach((k) => dom.window.localStorage.removeItem(k));

  await render();
  ok('★ 編輯模式和弦圖上有鉛筆鈕', Boolean(byLabel('編輯 C 指型')));
  ok('一開始沒有自訂', !custom.getCustomShape('C'));

  await click(byLabel('編輯 C 指型'));
  ok('★★ 點鉛筆開啟指板編輯器', Boolean(document.querySelector('[role="dialog"]')));
  ok('★ 指板是可點的 SVG', Boolean(document.querySelector('[role="dialog"] svg')));

  const cells = [...document.querySelectorAll('[role="dialog"] svg g')].filter((g) => g.querySelector('rect[fill="transparent"]'));
  ok('★ 指板有可點的格子', cells.length > 10, `${cells.length} 個`);
  for (const g of cells.slice(6, 10)) await svgClick(g);

  const saveBtn = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.includes('儲存'));
  ok('★ 有儲存鈕', Boolean(saveBtn));
  await click(saveBtn);

  ok('★★ 儲存後產生自訂指型', Boolean(custom.getCustomShape('C')), JSON.stringify(custom.getAllCustom()));
  ok('★★ 儲存後編輯器關閉', !document.querySelector('[role="dialog"]'));
  ok('★★ 自訂寫進 localStorage（可同步/匯出）', dom.window.localStorage.getItem('gcb.customshapes.v1') != null);

  await render();
  await click(byLabel('編輯 C 指型'));
  const delBtn = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.includes('刪除自訂'));
  ok('★ 有自訂時出現刪除鈕', Boolean(delBtn));
  await click(delBtn);
  ok('★★ 刪除後自訂消失，回到演算法版', !custom.getCustomShape('C'));

  // ---- 起始品可直接輸入（封閉和弦壓第幾格）----
  Object.keys(dom.window.localStorage).forEach((k) => dom.window.localStorage.removeItem(k));
  ver++;
  await render();
  await click(byLabel('編輯 C 指型'));

  const fretInput = document.querySelector('input[aria-label="起始品位"]');
  ok('★★ 有可輸入的起始品欄位', Boolean(fretInput));

  await setVal(fretInput, 5);
  ok('★★ 輸入起始品後欄位更新', document.querySelector('input[aria-label="起始品位"]').value === '5',
     `實際 ${document.querySelector('input[aria-label="起始品位"]').value}`);

  const fretLabels = [...document.querySelectorAll('[role="dialog"] svg text')].map((t) => t.textContent);
  ok('★★ 指板左側標出實際品數（看得出橫按壓第幾格）',
     fretLabels.includes('5') && fretLabels.includes('9'), fretLabels.join(','));

  // 格子排列是 str×row（每條弦連續 5 個品）。要按不同弦的第一品，
  // 得每隔 ROWS(5) 取一個格子 —— 而不是連續取前幾格（那是同一條弦連點）。
  const cells5 = [...document.querySelectorAll('[role="dialog"] svg g')].filter((g) => g.querySelector('rect[fill="transparent"]'));
  const ROWS = 5;
  for (let str = 1; str <= 3; str++) await svgClick(cells5[str * ROWS]); // 第 5-4-3 弦的第一品(=第5品)
  const saveBtn2 = [...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent.includes('儲存'));
  await click(saveBtn2);

  const saved = custom.getCustomShape('C');
  ok('★★ 儲存後品位正確（在第 5 品，因為起始品設 5）',
     saved && saved.frets.filter((f) => f === 5).length === 3, saved ? saved.frets.join(',') : 'null');

  ver++;
  await render();
  await click(byLabel('編輯 C 指型'));
  await setVal(document.querySelector('input[aria-label="起始品位"]'), 99);
  ok('★ 起始品有上限保護', Number(document.querySelector('input[aria-label="起始品位"]').value) <= 17);

  let pass = 0;
  for (const [c, n, e] of checks) { console.log(`${c ? '✅' : '❌'} ${n}${e ? '  → ' + e : ''}`); if (c) pass++; }
  console.log(`\n${pass}/${checks.length} 通過`);
  process.exit(pass === checks.length ? 0 : 1);
})();
