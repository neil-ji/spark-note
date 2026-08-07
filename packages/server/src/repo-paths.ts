import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 仓库路径解析。
 *
 * spark-note 的内容数据源（content/ 与 .claude/writing-dna/）位于仓库根目录，
 * packages/server 只是其中的一个 workspace。开发（tsx src/*）与构建（dist/*）两种
 * 运行形态下模块所在目录深度不同，因此从模块位置向上逐级寻找仓库根——
 * 判定依据是仓库根下的标志物（pnpm-workspace.yaml 或 .claude/writing-dna/）。
 */
function findRepoRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml')) || existsSync(path.join(dir, '.claude', 'writing-dna'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`无法定位 spark-note 仓库根目录（从 ${from} 向上查找失败）`);
    }
    dir = parent;
  }
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** spark-note 仓库根目录。 */
export const REPO_ROOT = findRepoRoot(moduleDir);

/** Writing DNA 文档目录（.claude/writing-dna/），可用 WRITING_DNA_DIR 覆盖（测试/部署用）。 */
export const WRITING_DNA_DIR =
  process.env.WRITING_DNA_DIR ?? path.join(REPO_ROOT, '.claude', 'writing-dna');

/** 对话会话目录（.pi/sessions/，JSONL 落盘），可用 PI_SESSION_DIR 覆盖（测试/部署用）。 */
export const SESSION_DIR = process.env.PI_SESSION_DIR ?? path.join(REPO_ROOT, '.pi', 'sessions');

/** 提示词模板目录（.pi/prompts/*.md），喂给 SDK DefaultResourceLoader 的 additionalPromptTemplatePaths。 */
export const PROMPT_TEMPLATES_DIR = path.join(REPO_ROOT, '.pi', 'prompts');
