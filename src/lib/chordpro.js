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

/* ------------------------------------------------------------------ *
 * 斷行單元切割
 * ------------------------------------------------------------------ */

// 中日韓文字（含假名）：每個字都是合法斷行點
const CJK_RE = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
// 行首禁則：這些標點不可出現在行首 → 黏在前一個字後面
const NO_LINE_START = /[，。、！？；：）〕】」』〉》︰…‥－～·,.!?;:)\]}]/;
// 行尾禁則：這些標點不可出現在行尾 → 黏在後一個字前面
const NO_LINE_END = /[（〔【「『〈《([{]/;

/**
 * 把一段文字切成可斷行的最小單元
 * - 拉丁文字：依空白切（單字不拆開）
 * - CJK：逐字切（中文沒有空白，不逐字切在窄螢幕會整句溢出）
 * - 標點：套用中文排版禁則，避免標點孤零零跑到行首
 */
export function splitText(text) {
  const out = [];
  const chars = [...String(text)];
  let latin = '';
  const flush = () => { if (latin) { out.push(latin); latin = ''; } };

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (/\s/.test(ch)) {
      flush();
      out.push(ch);                    // 空白自成一單元，提供斷行點
    } else if (NO_LINE_END.test(ch)) {
      flush();
      let unit = ch;                   // 開括號黏住下一個字
      if (i + 1 < chars.length) unit += chars[++i];
      while (i + 1 < chars.length && NO_LINE_START.test(chars[i + 1])) unit += chars[++i];
      out.push(unit);
    } else if (CJK_RE.test(ch)) {
      flush();
      let unit = ch;                   // 收尾標點黏住前一個字
      while (i + 1 < chars.length && NO_LINE_START.test(chars[i + 1])) unit += chars[++i];
      out.push(unit);
    } else {
      latin += ch;                     // 拉丁字母累積成單字
    }
  }
  flush();
  return out;
}

/**
 * 把 {chord, text} 切成「渲染單元」，和弦只掛在第一個單元上。
 * → 每個單元是一個 inline-flex（上和弦／下歌詞），
 *   換行只發生在單元「之間」，因此任何螢幕寬度下和弦都不會與歌詞錯位。
 */
export function pairsToUnits(pairs) {
  const units = [];
  for (const p of pairs) {
    const parts = splitText(p.text);
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
