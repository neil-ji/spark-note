import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { PROMPT_TEMPLATES_DIR } from '../repo-paths.js';

/**
 * 提示词模板元信息（GET /api/prompt-templates 返回结构）。
 * 只暴露元数据（name/description/argumentHint），不暴露模板正文——
 * 正文仅在服务端 /name 展开时由 SDK 消费（agent.ts 的 additionalPromptTemplatePaths）。
 */
export interface PromptTemplateMeta {
  name: string;
  description: string;
  argumentHint?: string;
}

/**
 * 解析 .md 模板文件的 YAML frontmatter（--- 块内的 key: value 标量行）。
 * 模板 frontmatter 是简单标量（SDK yaml 库的子集），此处手写解析避免引入新依赖。
 */
export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  if (!raw.startsWith('---')) return { meta: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  const block = raw.slice(3, end);
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && value) meta[key] = value.replace(/^["']|["']$/g, '');
  }
  return { meta, body: raw.slice(end + 4) };
}

/** 读取 .pi/prompts/ 下所有 .md 模板的元信息（未找到目录 → 空数组）。 */
export async function loadPromptTemplateMetas(): Promise<PromptTemplateMeta[]> {
  let entries: string[];
  try {
    entries = await readdir(PROMPT_TEMPLATES_DIR);
  } catch {
    return [];
  }
  const metas: PromptTemplateMeta[] = [];
  for (const file of entries) {
    if (!file.endsWith('.md')) continue;
    const raw = await readFile(path.join(PROMPT_TEMPLATES_DIR, file), 'utf8');
    const { meta } = parseFrontmatter(raw);
    metas.push({
      name: file.slice(0, -'.md'.length),
      description: meta.description ?? '',
      argumentHint: meta['argument-hint'] || undefined,
    });
  }
  metas.sort((a, b) => a.name.localeCompare(b.name));
  return metas;
}

/**
 * 提示词模板 API：
 *   GET /api/prompt-templates → 3 个 SKILL 模板元信息（/ 菜单数据源），
 *   正文不在前端出现，发送 /name args 后由服务端展开（sendPrompt 的 expandPromptTemplates）。
 */
export async function registerPromptTemplateRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/prompt-templates', async () => ({
    templates: await loadPromptTemplateMetas(),
  }));
}
