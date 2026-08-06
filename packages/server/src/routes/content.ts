import { createReadStream, existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { REPO_ROOT } from '../repo-paths.js';

/** 《听过》系列内容目录（content/听过/），数据源与 spark-note 内容仓库一致，只读。 */
const CONTENT_SERIES_DIR = path.join(REPO_ROOT, 'content', '听过');

/** 静态文件前缀：承载 index.html / ../brand.css / pngs/*.png 的预览访问。 */
const FILE_PREFIX = '/api/content/file';

/** 单期元信息。 */
export interface ContentIssueMeta {
  name: string;
  number: number;
  date: string;
  title: string | null;
  manuscript: string | null;
  hasHtml: boolean;
  htmlUrl: string | null;
  pngs: string[];
  pngUrls: string[];
}

/** 从期目录名解析信息：2026-07-19-issue-01 → { date: '2026-07-19', number: 1 }。 */
function parseIssueName(name: string): { date: string; number: number } | null {
  const m = /^(\d{4}-\d{2}-\d{2})-issue-(\d+)$/.exec(name);
  if (!m) return null;
  return { date: m[1], number: Number(m[2]) };
}

/** 取文稿首个非空行作为标题；无文稿时返回 null。 */
function resolveTitle(manuscript: string | null): string | null {
  if (!manuscript) return null;
  const first = manuscript.split('\n').find((line) => line.trim().length > 0);
  return first?.trim() ?? null;
}

/**
 * 内容管理数据 API：
 *   GET /api/content/issues              → 各期元信息列表（名称 / 日期 / 文稿 / HTML 存在性 / PNG 列表）
 *   GET /api/content/file/*              → 只读静态托管《听过》系列目录（HTML + 样式 + PNG 预览）
 *
 * 数据源为 spark-note 仓库的 content/听过/，只读，不做任何修改。
 */
export async function registerContentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/content/issues', async () => {
    let entries;
    try {
      entries = await readdir(CONTENT_SERIES_DIR, { withFileTypes: true });
    } catch {
      // 系列目录不存在时视为空库，不报错
      return { issues: [] };
    }

    const issues: ContentIssueMeta[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const parsed = parseIssueName(entry.name);
      if (!parsed) continue; // 只收录符合 issue 命名规范的期目录

      const dir = path.join(CONTENT_SERIES_DIR, entry.name);

      let manuscript: string | null = null;
      const manuscriptPath = path.join(dir, 'manuscript.txt');
      if (existsSync(manuscriptPath)) {
        manuscript = await readFile(manuscriptPath, 'utf8');
      }

      const hasHtml = existsSync(path.join(dir, 'index.html'));

      let pngs: string[] = [];
      try {
        const pngEntries = await readdir(path.join(dir, 'pngs'));
        pngs = pngEntries
          .filter((f) => f.toLowerCase().endsWith('.png'))
          .sort((a, b) => a.localeCompare(b, 'zh-CN'));
      } catch {
        // 无 pngs/ 目录则该期没有 PNG
      }

      issues.push({
        name: entry.name,
        number: parsed.number,
        date: parsed.date,
        title: resolveTitle(manuscript),
        manuscript,
        hasHtml,
        htmlUrl: hasHtml ? `${FILE_PREFIX}/${entry.name}/index.html` : null,
        pngs,
        pngUrls: pngs.map((f) => `${FILE_PREFIX}/${entry.name}/pngs/${f}`),
      });
    }

    // 按日期倒序（最新一期在前），同日期按期数倒序
    issues.sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number);

    return { issues };
  });

  // 只读文件服务：承载 index.html / ../brand.css / pngs/*.png 的预览访问。
  // 不用 @fastify/static 是避免与 index.ts 已注册的静态插件（sendFile 装饰器）冲突，
  // 这里自实现一个受限的、防目录穿越的文件路由即可。
  app.get<{ Params: { '*': string } }>('/api/content/file/*', async (req, reply) => {
    const resolved = path.resolve(CONTENT_SERIES_DIR, req.params['*']);
    if (!resolved.startsWith(CONTENT_SERIES_DIR + path.sep)) {
      reply.code(403);
      return { error: 'forbidden' };
    }

    let st;
    try {
      st = await stat(resolved);
    } catch {
      reply.code(404);
      return { error: 'not found' };
    }
    if (!st.isFile()) {
      reply.code(404);
      return { error: 'not found' };
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType =
      ext === '.png'
        ? 'image/png'
        : ext === '.html'
          ? 'text/html; charset=utf-8'
          : ext === '.css'
            ? 'text/css; charset=utf-8'
            : 'application/octet-stream';
    reply.type(contentType);
    return reply.send(createReadStream(resolved));
  });
}
