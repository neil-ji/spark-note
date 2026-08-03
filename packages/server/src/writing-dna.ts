import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { DNA_DIR } from './config.js';

export interface DnaDoc {
  /** 去扩展名的文件名，用作前端文档切换的 key。 */
  slug: string;
  /** 文件名（含 .md）。 */
  name: string;
  /** 文档首行 H1 标题；无则回退为文件名。 */
  title: string;
  /** 原始 Markdown 全文，前端结构化渲染。 */
  raw: string;
}

export interface DnaRule {
  /** 规则序号（1 起）。 */
  index: number;
  /** 加粗部分，如「条目分号收尾」。 */
  title: string;
  /** 规则详情；条目无加粗时整条作为标题、详情留空。 */
  detail: string;
}

export interface WritingDnaPayload {
  docs: DnaDoc[];
  rules: DnaRule[];
}

/** 取 Markdown 首行 H1（# …）作文档标题。 */
function parseTitle(raw: string, name: string): string {
  const match = raw.match(/^#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : name.replace(/\.md$/, '');
}

/**
 * 从 Writing-DNA.md 的「核心规则(可执行)」章节抽取编号规则清单。
 *
 * 条目格式：`N. **加粗标题**:详情`。该清单是写作前后的核心约束，
 * 前端据此渲染可勾选的自检清单——数据源是文档本身，不另行硬编码。
 */
export function parseCoreRules(raw: string): DnaRule[] {
  const lines = raw.split('\n');
  const startIdx = lines.findIndex((line) => /^#{1,3}\s+核心规则/.test(line));
  if (startIdx === -1) return [];

  const rules: DnaRule[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    // 下一个标题结束当前章节
    if (/^#{1,6}\s+/.test(line)) break;

    const item = line.match(/^\s*(\d+)[.、]\s+(.*)$/);
    if (!item) continue;
    const body = item[2].trim();
    if (!body) continue;

    const bold = body.match(/^\*\*(.+?)\*\*\s*[:：]?\s*(.*)$/);
    rules.push({
      index: Number(item[1]),
      title: bold ? bold[1].trim() : body,
      detail: bold ? bold[2].trim() : '',
    });
  }
  return rules;
}

/**
 * 注册 GET /api/writing-dna：
 * 读取 .claude/writing-dna/ 下全部 Markdown 文档，返回原文 + 核心规则清单。
 * 数据源缺失时返回 404（目录不存在），由前端展示可重试的提示。
 */
export async function registerWritingDnaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/writing-dna', async (_req, reply) => {
    let entries;
    try {
      entries = await readdir(DNA_DIR, { withFileTypes: true });
    } catch (err) {
      app.log.warn({ err }, 'writing-dna dir not readable');
      return reply.code(404).send({ error: 'writing-dna directory not found', dir: DNA_DIR });
    }

    const mdFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .sort((a, b) => a.name.localeCompare(b.name));

    const docs: DnaDoc[] = [];
    for (const file of mdFiles) {
      const raw = await readFile(path.join(DNA_DIR, file.name), 'utf8');
      docs.push({
        slug: file.name.replace(/\.md$/, ''),
        name: file.name,
        title: parseTitle(raw, file.name),
        raw,
      });
    }

    // 核心规则以整合文档 Writing-DNA.md 为准，缺失时回退到第一份文档。
    const main = docs.find((doc) => doc.slug === 'Writing-DNA') ?? docs[0];
    const rules = main ? parseCoreRules(main.raw) : [];

    return { docs, rules };
  });
}
