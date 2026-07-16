/**
 * chordpro.js — ChordPro 解析器
 * 輸入：ChordPro 純文字
 * 輸出：可直接餵給 React 渲染的結構化 AST
 *
 * 支援指令：
 *   {title:} {t:}  {subtitle:} {st:} {artist:} {key:} {capo:} {tempo:}
 *   {comment:} {c:}
 *   {start_of_chorus} {soc} / {end_of_chorus} {eoc}
 *   {start_of_tab}    {sot} / {end_of_tab}    {eot}
 *   # 開頭為註解列（不輸出）
 */

const DIRECTIVE_RE = /^\{\s*([a-zA-Z_]+)\s*(?::\s*([\s\S]*?))?\s*\}$/;

const META_ALIAS = {
  t: 'title',
  title: 'title',
  st: 'subtitle',
  subtitle: 'subtitle',
  artist: 'artist',
  composer: 'composer',
  key: 'key',
  capo: 'capo',
  tempo: 'tempo',
  time: 'time',
};

/**
 * 拆解一行歌詞為 [{chord, text}, ...]
 * 規則：和弦「掛」在其後方的文字上；行首無和弦則 chord = null
 */
export function parseChordLine(line) {
  const tokens = line.split(/(\[[^\]]*\])/g).filter((s) => s !== '');
  const pairs = [];
  for (const t of tokens) {
    if (t.startsWith('[') && t.endsWith(']')) {
      pairs.push({ chord: t.slice(1, -1).trim(), text: '' });
    } else if (pairs.length && pairs[pairs.length - 1].text === '' && pairs[pairs.length - 1].chord) {
      pairs[pairs.length - 1].text = t;
    } else {
      pairs.push({ chord: null, text: t });
    }
  }
  return pairs.length ? pairs : [{ chord: null, text: '' }];
}

/** 主解析函式 */
export function parseChordPro(source = '') {
  const meta = {};
  const blocks = [];
  let current = null; // 目前累積中的 block
  let mode = 'verse'; // verse | chorus | tab

  const flush = () => {
    if (current && current.lines.length) blocks.push(current);
    current = null;
  };
  const ensure = (type) => {
    if (!current || current.type !== type) {
      flush();
      current = { type, lines: [] };
    }
    return current;
  };

  for (const rawLine of String(source).replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    // 註解列
    if (trimmed.startsWith('#')) continue;

    // 指令
    const d = DIRECTIVE_RE.exec(trimmed);
    if (d) {
      const name = d[1].toLowerCase();
      const value = (d[2] || '').trim();

      if (META_ALIAS[name]) {
        meta[META_ALIAS[name]] = value;
        continue;
      }
      if (name === 'comment' || name === 'c' || name === 'comment_italic' || name === 'ci') {
        flush();
        blocks.push({ type: 'comment', lines: [{ type: 'text', text: value }] });
        continue;
      }
      if (name === 'start_of_chorus' || name === 'soc') { flush(); mode = 'chorus'; continue; }
      if (name === 'end_of_chorus' || name === 'eoc') { flush(); mode = 'verse'; continue; }
      if (name === 'start_of_tab' || name === 'sot') { flush(); mode = 'tab'; continue; }
      if (name === 'end_of_tab' || name === 'eot') { flush(); mode = 'verse'; continue; }
      continue; // 未支援的指令直接忽略
    }

    // 空行 = 段落分隔（tab 區塊內保留空行）
    if (trimmed === '' && mode !== 'tab') { flush(); continue; }

    if (mode === 'tab') {
      ensure('tab').lines.push({ type: 'text', text: line });
    } else {
      ensure(mode).lines.push({ type: 'lyric', pairs: parseChordLine(line) });
    }
  }
  flush();

  return { meta, blocks };
}

/** 依出現順序抽出所有和弦字串（給 detectKey / 和弦總表用） */
export function collectChords(ast) {
  const out = [];
  for (const b of ast.blocks) {
    if (b.type === 'tab' || b.type === 'comment') continue;
    for (const l of b.lines) {
      for (const p of l.pairs || []) {
        if (p.chord) out.push(...p.chord.split(/\s+/).filter(Boolean));
      }
    }
  }
  return out;
}

/**
 * 把 {chord, text} 再切成「渲染單元」：
 * 文字依空白切開，和弦只掛在第一個單元上。
 * → 每個單元是一個 inline-block，換行只會發生在單元「之間」，
 *   因此任何螢幕寬度下和弦都不會與歌詞錯位。
 */
export function pairsToUnits(pairs) {
  const units = [];
  for (const p of pairs) {
    const parts = String(p.text).split(/(\s+)/).filter((s) => s !== '');
    if (parts.length === 0) {
      units.push({ chord: p.chord, text: '' });
      continue;
    }
    parts.forEach((part, i) => {
      units.push({ chord: i === 0 ? p.chord : null, text: part });
    });
  }
  return units;
}
