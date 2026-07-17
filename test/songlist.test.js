import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByArtist, UNGROUPED } from '../src/lib/grouping.js';

const s = (id, title, artist) => ({ id, title, artist });

test('★ 依歌手分組', () => {
  const g = groupByArtist([
    s('1', 'A曲', '歌手乙'), s('2', 'B曲', '歌手甲'), s('3', 'C曲', '歌手乙'),
  ]);
  assert.equal(g.length, 2);
  const map = Object.fromEntries(g.map(([k, v]) => [k, v.length]));
  assert.deepEqual(map, { 歌手乙: 2, 歌手甲: 1 });
});

test('★ 沒填歌手的歸「未分類」，且永遠排最後', () => {
  const g = groupByArtist([
    s('1', 'A', ''), s('2', 'B', '歌手甲'), s('3', 'C', undefined), s('4', 'D', '  '),
  ]);
  assert.equal(g[g.length - 1][0], UNGROUPED);
  assert.equal(g[g.length - 1][1].length, 3, '空字串、undefined、純空白都算未分類');
});

test('歌手名前後空白要當成同一組', () => {
  const g = groupByArtist([s('1', 'A', '歌手乙'), s('2', 'B', ' 歌手乙 ')]);
  assert.equal(g.length, 1, '前後空白不該分裂成兩組');
  assert.equal(g[0][1].length, 2);
});

test('空清單不會爆', () => {
  assert.deepEqual(groupByArtist([]), []);
});
