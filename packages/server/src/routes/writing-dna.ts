import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { WRITING_DNA_DIR } from '../repo-paths.js';
import { parseWritingDna, resolveTitle, type DnaBlock } from '../writing-dna/parser.js';
import { extractChecklist, type ChecklistGroup } from '../writing-dna/checklist.js';

/** 文件名 → 路由 slug：去掉 .md 后缀即可（如 Writing-DNA.md → Writing-DNA）。 */
function slugFromFileName(fileName: string): string {
  return fileName.replace(/\.md$/, '');
}

async function listDnaFiles(): Promise<string[]> {
  const entries = await readdir(WRITING_DNA_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

/**
 * Writing DNA 数据 API：
 *   GET /api/writing-dna              → 文档列表（slug / title / fileName / blockCount）
 *   GET /api/writing-dna/:slug        → 单个文档的结构化块 + 规则对照清单（命中时）
 *
 * 数据源为 spark-note 仓库的 .claude/writing-dna/ 目录，只读，不做任何修改。
 */
export async function registerWritingDnaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/writing-dna', async () => {
    const files = await listDnaFiles();
    const docs = await Promise.all(
      files.map(async (fileName) => {
        const text = await readFile(path.join(WRITING_DNA_DIR, fileName), 'utf8');
        const blocks = parseWritingDna(text);
        return {
          slug: slugFromFileName(fileName),
          title: resolveTitle(blocks, fileName),
          fileName,
          blockCount: blocks.length,
        };
      }),
    );
    return { docs };
  });

  app.get<{ Params: { slug: string } }>('/api/writing-dna/:slug', async (req, reply) => {
    const { slug } = req.params;
    const files = await listDnaFiles();
    const fileName = files.find((f) => slugFromFileName(f) === slug);
    if (!fileName) {
      reply.code(404);
      return { error: `writing-dna doc not found: ${slug}` };
    }

    const text = await readFile(path.join(WRITING_DNA_DIR, fileName), 'utf8');
    const blocks: DnaBlock[] = parseWritingDna(text);
    const checklist: ChecklistGroup[] = extractChecklist(blocks);

    return {
      doc: {
        slug,
        title: resolveTitle(blocks, fileName),
        fileName,
        blocks,
        checklist: checklist.length > 0 ? checklist : undefined,
      },
    };
  });
}
