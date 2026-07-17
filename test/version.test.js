import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, nextLetter, nextVersion, todayStamp, formatVersion } from '../src/lib/version.js';

test('版次格式必須是 YYYYMMDD + 字母', () => {
  assert.match(VERSION, /^\d{8}[a-z]+$/, `目前版次 ${VERSION} 格式不對`);
});

test('字母序遞增（含進位）', () => {
  assert.equal(nextLetter('a'), 'b');
  assert.equal(nextLetter('y'), 'z');
  assert.equal(nextLetter('z'), 'aa', 'z 之後要進位');
  assert.equal(nextLetter('az'), 'ba');
  assert.equal(nextLetter('zz'), 'aaa');
  assert.equal(nextLetter(''), 'a');
});

test('★ 同一天再改版 → 字母 +1', () => {
  assert.equal(nextVersion('20260717a', '20260717'), '20260717b');
  assert.equal(nextVersion('20260717z', '20260717'), '20260717aa');
});

test('★ 換日 → 重新從 a 開始', () => {
  assert.equal(nextVersion('20260717c', '20260718'), '20260718a');
  assert.equal(nextVersion('20260717c', '20270101'), '20270101a');
});

test('★ 版次壞掉或空的也要能救回來，不可丟例外', () => {
  for (const junk of ['', null, undefined, 'abc', '2026', '99999999x!']) {
    assert.doesNotThrow(() => nextVersion(junk, '20260717'));
    assert.equal(nextVersion(junk, '20260717'), '20260717a');
  }
});

test('★ 日期戳必須用本地時區（台灣半夜用 UTC 會算成前一天）', () => {
  // 台灣 UTC+8：當地 2026/07/17 00:30 → UTC 仍是 07/16
  const midnight = new Date(2026, 6, 17, 0, 30);
  assert.equal(todayStamp(midnight), '20260717', 'toISOString() 會給出 20260716，那是錯的');
  assert.equal(todayStamp(new Date(2026, 0, 5)), '20260105', '月份與日期要補零');
  assert.match(todayStamp(), /^\d{8}$/);
});

test('版次顯示成人看得懂的格式', () => {
  assert.equal(formatVersion('20260717a'), '2026/07/17 a');
  assert.equal(formatVersion('20260717ab'), '2026/07/17 ab');
  assert.equal(formatVersion('壞掉的'), '壞掉的');
});
