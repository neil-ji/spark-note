/**
 * Writing DNA markdown 结构化解析器。
 *
 * 把 .claude/writing-dna/ 下的文档解析为一组块（heading / paragraph / quote /
 * list / code / table），供前端做结构化渲染与规则对照清单提取。
 *
 * 覆盖的语法子集：
 *   - `#`~`######` 标题
 *   - `>` 引用块
 *   - 有序列表 `1. ` 与无序列表 `- ` / `* `
 *   - 代码块（```` ``` ```` 围栏；围栏行带语言标注；内容中的 ```` ```xxx ```` 视为示例文本，
 *     仅 ```` ``` ```` 且无尾随内容的行才关闭代码块）
 *   - 表格（`| a | b |` 头 + `|---|---|` 分隔行 + 数据行）
 *   - 其余为段落
 *
 * 行内格式（`**加粗**`、`` `代码` ``、`[文字](链接)`）不做解析，原样保留，
 * 由前端 InlineText 组件负责渲染。
 */

export type DnaBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'table'; headers: string[]; rows: string[][] };

/** 行内格式去锚文本（用于列表项的展示，同时保留原样用于检查）。 */
export interface ParsedDocument {
  /** 首个一级标题文本，缺省时为文件名（去 .md 后缀）。 */
  title: string;
  blocks: DnaBlock[];
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const UL_RE = /^\s*[-*]\s+(.*)$/;
const FENCE_RE = /^```(.*)$/;
/** 关闭代码块的围栏：仅允许尾随空白，不允许语言标注等尾随内容。 */
const CLOSE_FENCE_RE = /^```\s*$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR_RE = /^\s*\|?[\s:|-]+\|?\s*$/;

function isTableSeparator(line: string): boolean {
  if (!TABLE_SEPARATOR_RE.test(line)) return false;
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** 非空且不是任何块的开头（用于判断段落是否应结束）。 */
function startsNewBlock(line: string): boolean {
  return (
    HEADING_RE.test(line) ||
    QUOTE_RE.test(line) ||
    FENCE_RE.test(line) ||
    OL_RE.test(line) ||
    UL_RE.test(line)
  );
}

export function parseWritingDna(markdown: string): DnaBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: DnaBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    const fence = line.match(FENCE_RE);
    if (fence) {
      const lang = fence[1].trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !CLOSE_FENCE_RE.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 跳过关闭围栏（若文件未闭合，i 已到末尾）
      blocks.push({ kind: 'code', lang, code: codeLines.join('\n') });
      continue;
    }

    // 标题
    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    // 引用块
    if (QUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoteLines.push(lines[i].match(QUOTE_RE)![1]);
        i++;
      }
      blocks.push({ kind: 'quote', text: quoteLines.join('\n') });
      continue;
    }

    // 表格：当前行是数据行、下一行是分隔行 → 表头 + 表体
    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i]) && !isTableSeparator(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }

    // 有序列表
    const ol = line.match(OL_RE);
    if (ol) {
      const items: string[] = [ol[1]];
      i++;
      while (i < lines.length) {
        const m = lines[i].match(OL_RE);
        if (m) {
          items.push(m[1]);
          i++;
        } else if (lines[i].trim() === '') {
          break;
        } else {
          break;
        }
      }
      blocks.push({ kind: 'list', ordered: true, items });
      continue;
    }

    // 无序列表
    const ul = line.match(UL_RE);
    if (ul) {
      const items: string[] = [ul[1]];
      i++;
      while (i < lines.length) {
        const m = lines[i].match(UL_RE);
        if (m) {
          items.push(m[1]);
          i++;
        } else if (lines[i].trim() === '') {
          break;
        } else {
          break;
        }
      }
      blocks.push({ kind: 'list', ordered: false, items });
      continue;
    }

    // 空行
    if (line.trim() === '') {
      i++;
      continue;
    }

    // 段落：收集到空行或新块开始为止
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !startsNewBlock(lines[i]) &&
      !TABLE_ROW_RE.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'paragraph', text: para.join('\n') });
  }

  return blocks;
}

/** 从解析结果中取文档标题（首个一级标题；没有则取文件名去 .md 后缀）。 */
export function resolveTitle(blocks: DnaBlock[], fallbackFileName: string): string {
  const h1 = blocks.find((b) => b.kind === 'heading' && b.level === 1);
  if (h1 && h1.kind === 'heading') return h1.text;
  return fallbackFileName.replace(/\.md$/, '');
}
