#!/usr/bin/env node
/**
 * scripts/bump.mjs — 自動遞增修改版次
 *
 * 用法：npm run bump
 *   同一天再跑 → 字母序 +1（a → b → c）
 *   換日再跑   → 重新從 a 開始
 *
 * 為什麼要有這支：手改版次一定會發生「忘記改」或「日期打錯」，
 * 而版次的唯一用途就是確認線上跑的是不是你剛推的那版 —— 一旦不可信就沒意義了。
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { nextVersion, todayStamp, formatVersion } from '../src/lib/version.js';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'version.js');

const src = readFileSync(FILE, 'utf-8');
const m = /export const VERSION = '([^']*)';/.exec(src);
if (!m) {
  console.error('✗ 在 src/lib/version.js 找不到 VERSION，請確認檔案沒被改壞');
  process.exit(1);
}

const current = m[1];
const next = nextVersion(current, todayStamp());

writeFileSync(FILE, src.replace(m[0], `export const VERSION = '${next}';`), 'utf-8');

console.log(`版次 ${current} → ${next}   (${formatVersion(next)})`);
console.log('記得一起 commit：git add -A && git commit -m "..."');
