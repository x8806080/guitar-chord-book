import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir, out = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', '.smoke'].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|cjs|mjs|json)$/.test(e.name)) out.push(p);
  }
  return out;
};
const FILES = walk(ROOT);

test('★ 專案內不可有硬編碼的絕對路徑（換一台電腦、改一次資料夾名就全爛）', () => {
  const bad = [];
  for (const f of FILES) {
    const src = readFileSync(f, 'utf-8');
    // Unix 家目錄、Windows 磁碟機代號
    for (const re of [/['"`]\/(home|Users)\/[\w.-]+\//g, /['"`][A-Za-z]:[\\/]/g]) {
      for (const m of src.match(re) ?? []) bad.push(`${f.replace(ROOT, '.')} → ${m}`);
    }
  }
  assert.deepEqual(bad, [], '發現硬編碼絕對路徑：\n' + bad.join('\n'));
});

test('★ 測試不可綁死特定的 GitHub Pages 網址', () => {
  // 綁死 repo 名的話，改 repo 名或別人 fork 就得改測試
  const bad = [];
  for (const f of FILES) {
    if (f.endsWith('hygiene.test.js')) continue;
    const src = readFileSync(f, 'utf-8');
    for (const m of src.match(/https:\/\/[\w-]+\.github\.io\/[\w-]+/g) ?? []) {
      if (!/example/i.test(m)) bad.push(`${f.replace(ROOT, '.')} → ${m}`);
    }
  }
  assert.deepEqual(bad, [], '寫死了 Pages 網址：\n' + bad.join('\n'));
});

test('★ 沒有夾帶任何真實金鑰（防手滑）', () => {
  const bad = [];
  for (const f of FILES) {
    if (f.endsWith('hygiene.test.js') || f.endsWith('package-lock.json')) continue;
    const src = readFileSync(f, 'utf-8');
    for (const re of [/github_pat_[A-Za-z0-9_]{20,}/g, /ghp_[A-Za-z0-9]{30,}/g, /AIza[A-Za-z0-9_-]{30,}/g]) {
      for (const m of src.match(re) ?? []) {
        // 測試用假值必須明確標示 FAKE / EXAMPLE，否則一律視為外洩
        if (!/FAKE|EXAMPLE/i.test(m)) bad.push(`${f.replace(ROOT, '.')} → ${m.slice(0, 16)}…`);
      }
    }
  }
  assert.deepEqual(bad, [], '疑似真實金鑰：\n' + bad.join('\n'));
});
