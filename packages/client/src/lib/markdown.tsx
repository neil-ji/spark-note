import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { copyTextToClipboard } from './clipboard';

/**
 * 零依赖 Markdown 结构化渲染器。
 *
 * 覆盖 Writing DNA 文档实际用到的语法子集：
 *   - 块级：H1–H6 标题、引用块、围栏代码块（带语言标注 + 复制）、
 *           无序/有序列表（含一层嵌套）、表格、分隔线、段落
 *   - 行内：`code`、**粗体**、*斜体*、[链接](url)
 *
 * 渲染为语义化 React 元素，样式由外层 .dna-prose（见 index.css）统一控制。
 * 标题带锚点 id，供页面大纲「本文结构」跳转定位。
 */

export type Block =
  | { type: 'heading'; level: number; text: string; id: string }
  | { type: 'para'; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'hr' };

export interface ListItem {
  text: string;
  nested: Block[];
}

export interface OutlineItem {
  level: number;
  text: string;
  id: string;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^(`{3,})(.*)$/;
const HR_RE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const LIST_ITEM_RE = /^(\s*)([-*+]|\d+[.、])\s+(.*)$/;
const TABLE_ROW_RE = /^\s*\|/;
const QUOTE_RE = /^>\s?/;

function parseList(lines: string[], start: number): { block: Block; next: number } {
  const firstMatch = lines[start].match(LIST_ITEM_RE)!;
  const ordered = /^\d+[.、]/.test(firstMatch[2]);
  const indent = firstMatch[1].length;
  const items: ListItem[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') break;
    const m = line.match(LIST_ITEM_RE);
    if (!m || m[1].length !== indent) break;
    if (/^\d+[.、]/.test(m[2]) !== ordered) break; // 列表类型切换视为结束

    const item: ListItem = { text: m[3], nested: [] };
    i++;

    // 续行 / 嵌套内容：后续行缩进更深
    while (i < lines.length) {
      const nextLine = lines[i];
      if (nextLine.trim() === '') break;
      const nm = nextLine.match(LIST_ITEM_RE);
      const nextIndent = nextLine.match(/^\s*/)![0].length;
      if (nm && nextIndent > indent) {
        const child = parseList(lines, i);
        item.nested.push(child.block);
        i = child.next;
      } else if (nextIndent > indent) {
        item.text += ' ' + nextLine.trim();
        i++;
      } else {
        break;
      }
    }
    items.push(item);
  }

  return { block: { type: 'list', ordered, items }, next: i };
}

/** 将 Markdown 原文解析为块级结构。标题锚点 id 在此阶段去重生成，与页面大纲一致。 */
export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  const usedIds = new Set<string>();

  const slugify = (text: string): string => {
    const base = text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '');
    let id = base || 'section';
    let n = 2;
    while (usedIds.has(id)) id = `${base || 'section'}-${n++}`;
    usedIds.add(id);
    return id;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    // 标题
    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: heading[2].trim(),
        id: slugify(heading[2]),
      });
      i++;
      continue;
    }

    // 围栏代码块
    const fence = line.match(FENCE_RE);
    if (fence) {
      const ticks = fence[1];
      const lang = fence[2].trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const codeLine = lines[i];
        // 关闭围栏：仅反引号（可带尾随空格），且数量不小于开启围栏；
        // 带信息串的行（如 "```语言 代码块"）不是合法关闭围栏，按内容处理。
        const close = codeLine.match(/^(`{3,})\s*$/);
        if (close && close[1].length >= ticks.length) {
          i++;
          break;
        }
        codeLines.push(codeLine);
        i++;
      }
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') });
      continue;
    }

    // 表格
    if (TABLE_ROW_RE.test(line)) {
      const rows: string[][] = [];
      let header: string[] | null = null;
      while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
        const cells = lines[i]
          .split('|')
          .map((cell) => cell.trim());
        if (cells[0] === '') cells.shift();
        if (cells[cells.length - 1] === '') cells.pop();
        if (header === null) {
          header = cells;
        } else if (cells.every((cell) => /^:?-+:?$/.test(cell))) {
          // 分隔行（|---|---|），跳过
        } else {
          rows.push(cells);
        }
        i++;
      }
      if (header) blocks.push({ type: 'table', header, rows });
      continue;
    }

    // 引用块
    if (QUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoteLines.push(lines[i].replace(QUOTE_RE, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
      continue;
    }

    // 分隔线
    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // 列表
    if (LIST_ITEM_RE.test(line)) {
      const { block, next } = parseList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }

    // 段落：连续普通行合并为一段（Markdown 软换行即空格）
    const paraLines: string[] = [];
    while (i < lines.length) {
      const paraLine = lines[i];
      if (
        paraLine.trim() === '' ||
        HEADING_RE.test(paraLine) ||
        FENCE_RE.test(paraLine) ||
        TABLE_ROW_RE.test(paraLine) ||
        QUOTE_RE.test(paraLine) ||
        HR_RE.test(paraLine) ||
        LIST_ITEM_RE.test(paraLine)
      ) {
        break;
      }
      paraLines.push(paraLine.trim());
      i++;
    }
    blocks.push({ type: 'para', text: paraLines.join(' ') });
  }

  return blocks;
}

/** 提取文档大纲（所有标题层级），供「本文结构」侧栏使用。 */
export function getOutline(blocks: Block[]): OutlineItem[] {
  return blocks
    .filter((block): block is Extract<Block, { type: 'heading' }> => block.type === 'heading')
    .map((block) => ({ level: block.level, text: block.text, id: block.id }));
}

// ---------- 行内渲染 ----------

const INLINE_RE = new RegExp(
  [
    '(`[^`\\n]+`)', // 1 inline code
    '(\\*\\*(?:[^*\\n])+\\*\\*)', // 2 bold
    '(\\[(?:[^\\]\\n])+\\]\\((?:[^)\\s])+\\))', // 3 link
    '((?<![*\\w])\\*(?=\\S)[^*\\n]*?(?<=\\S)\\*(?![\\w*]))', // 4 italic（带边界防误伤）
  ].join('|'),
  'g',
);

export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE_RE)) {
    const [token, code, bold, link, italic] = match;
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));

    if (code !== undefined) {
      nodes.push(<code key={nodes.length}>{code.slice(1, -1)}</code>);
    } else if (bold !== undefined) {
      nodes.push(<strong key={nodes.length}>{renderInline(bold.slice(2, -2))}</strong>);
    } else if (link !== undefined) {
      const inner = link.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      nodes.push(
        <a key={nodes.length} href={inner[2]} target="_blank" rel="noreferrer">
          {renderInline(inner[1])}
        </a>,
      );
    } else if (italic !== undefined) {
      nodes.push(<em key={nodes.length}>{renderInline(italic.slice(1, -1))}</em>);
    }

    last = start + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// ---------- 块级渲染 ----------

function CodeBlockView({ lang, code }: { lang: string; code: string }) {
  // P2-7：与消息气泡复制共用 copyTextToClipboard（clipboard 优先 + execCommand 降级），
  // 双路径都失败时明确提示「复制失败」，不再静默吞掉。
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<number | null>(null);

  // 卸载时清理计时器，避免卸载后 setState。
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopy = () => {
    void copyTextToClipboard(code).then((ok) => {
      setCopyState(ok ? 'copied' : 'failed');
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopyState('idle'), 1200);
    });
  };

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-neutral-400">
          {lang || 'text'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          title={copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制代码'}
          className="rounded px-2 py-0.5 text-[11px] font-medium text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100"
        >
          {copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制'}
        </button>
      </div>
      <pre className="min-h-[3rem] overflow-x-auto p-3 text-[13px] leading-relaxed text-neutral-100">
        <code>{code || ' '}</code>
      </pre>
    </div>
  );
}

function ListBlockView({ block }: { block: Extract<Block, { type: 'list' }> }) {
  const Tag = block.ordered ? 'ol' : 'ul';
  return (
    <Tag className={block.ordered ? 'dna-ol' : 'dna-ul'}>
      {block.items.map((item, index) => (
        <li key={index}>
          {renderInline(item.text)}
          {item.nested.map((nestedBlock, j) => (
            <BlockView key={j} block={nestedBlock} />
          ))}
        </li>
      ))}
    </Tag>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading': {
      const Tag = (`h${Math.min(block.level, 4)}`) as 'h1' | 'h2' | 'h3' | 'h4';
      return <Tag id={block.id}>{renderInline(block.text)}</Tag>;
    }
    case 'para':
      return <p>{renderInline(block.text)}</p>;
    case 'blockquote':
      return <blockquote>{renderInline(block.text)}</blockquote>;
    case 'code':
      return <CodeBlockView lang={block.lang} code={block.code} />;
    case 'list':
      return <ListBlockView block={block} />;
    case 'table':
      return (
        <div className="my-3 overflow-x-auto">
          <table>
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i}>{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr />;
  }
}

/** 渲染一组已解析的块。 */
export function Blocks({ blocks, className }: { blocks: Block[]; className?: string }) {
  return (
    <div className={className}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

/** Markdown → React 元素。样式交给外层 .dna-prose。 */
export function Markdown({ markdown, className }: { markdown: string; className?: string }) {
  const blocks = useMemo(() => parseBlocks(markdown), [markdown]);
  return <Blocks blocks={blocks} className={className} />;
}
