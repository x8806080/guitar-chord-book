import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTube, parseTimestamp, buildEmbedUrl, buildWatchUrl } from '../src/lib/youtube.js';

const ID = 'dQw4w9WgXcQ';

test('★ 各種來源的連結格式都要接得住', () => {
  const CASES = [
    ['https://www.youtube.com/watch?v=' + ID, '桌機網址列'],
    ['https://youtube.com/watch?v=' + ID, '沒有 www'],
    ['https://m.youtube.com/watch?v=' + ID, '手機版'],
    ['https://music.youtube.com/watch?v=' + ID, 'YouTube Music'],
    ['https://youtu.be/' + ID, '分享短網址'],
    ['https://www.youtube.com/embed/' + ID, '嵌入網址'],
    ['https://www.youtube.com/shorts/' + ID, 'Shorts'],
    ['https://www.youtube.com/live/' + ID, '直播'],
    ['youtube.com/watch?v=' + ID, '沒有 https'],
    ['  https://youtu.be/' + ID + '  ', '前後有空白'],
    [ID, '直接貼 ID'],
  ];
  for (const [url, desc] of CASES) {
    const r = parseYouTube(url);
    assert.ok(r, `${desc} 應解析成功：${url}`);
    assert.equal(r.id, ID, desc);
  }
});

test('★ 時間戳要保留（分享某個段落時很常見）', () => {
  assert.equal(parseYouTube('https://youtu.be/' + ID + '?t=90').start, 90);
  assert.equal(parseYouTube('https://www.youtube.com/watch?v=' + ID + '&t=90s').start, 90);
  assert.equal(parseYouTube('https://www.youtube.com/watch?v=' + ID + '&t=1m30s').start, 90);
  assert.equal(parseYouTube('https://www.youtube.com/watch?v=' + ID + '&t=1h2m3s').start, 3723);
  assert.equal(parseYouTube('https://www.youtube.com/watch?v=' + ID).start, 0);
});

test('時間戳解析', () => {
  assert.equal(parseTimestamp('90'), 90);
  assert.equal(parseTimestamp('2m'), 120);
  assert.equal(parseTimestamp('1h'), 3600);
  assert.equal(parseTimestamp(''), 0);
  assert.equal(parseTimestamp('abc'), 0);
  assert.equal(parseTimestamp(null), 0);
});

test('★ 連結打錯不可炸掉樂譜，一律安靜回 null', () => {
  for (const junk of ['', null, undefined, '   ', 'https://vimeo.com/12345', 'https://example.com/watch?v=' + ID,
                      'not a url', 'https://youtube.com/', 'https://youtube.com/watch', 'https://youtu.be/tooshort',
                      'https://www.youtube.com/watch?v=way_too_long_id_here', '{youtube: }']) {
    assert.doesNotThrow(() => parseYouTube(junk), `${junk} 不可丟例外`);
    assert.equal(parseYouTube(junk), null, `${junk} 應回 null`);
  }
});

test('★ 嵌入用 nocookie 網域（按播放前不追蹤）', () => {
  const url = buildEmbedUrl({ id: ID, start: 0 });
  assert.ok(url.startsWith('https://www.youtube-nocookie.com/embed/' + ID), url);
  assert.ok(url.includes('rel=0'), '不要顯示其他頻道的相關影片');
  assert.ok(url.includes('playsinline=1'), 'iOS 不要強制全螢幕');
});

test('嵌入網址帶入起始時間與自動播放', () => {
  const url = buildEmbedUrl({ id: ID, start: 90 }, { autoplay: true });
  assert.ok(url.includes('start=90'));
  assert.ok(url.includes('autoplay=1'));
  assert.ok(!buildEmbedUrl({ id: ID, start: 0 }).includes('start='), 'start=0 不必帶');
});

test('在 YouTube 開啟的連結', () => {
  assert.equal(buildWatchUrl({ id: ID }), 'https://www.youtube.com/watch?v=' + ID);
  assert.equal(buildWatchUrl({ id: ID, start: 90 }), 'https://www.youtube.com/watch?v=' + ID + '&t=90s');
});

test('★ ChordPro 的 {youtube:} {yt:} {video:} 都能用', async () => {
  const { parseChordPro } = await import('../src/lib/chordpro.js');
  for (const d of ['youtube', 'yt', 'video']) {
    const ast = parseChordPro(`{${d}: https://youtu.be/${ID}}\n[C]test`);
    assert.equal(ast.meta.youtube, 'https://youtu.be/' + ID, `{${d}:} 應寫入 meta.youtube`);
    assert.equal(parseYouTube(ast.meta.youtube)?.id, ID);
  }
});
