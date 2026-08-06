import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from './repo-paths.js';

/**
 * Provider/Model 配置存储（.pi/config.json）。
 *
 * 优先级约定（自高到低）：环境变量 > .pi/config.json > 代码默认值。
 *   provider       无 env（恒 anthropic）       > file.provider       > 'anthropic'
 *   modelId        PI_MODEL                    > file.modelId        > 'claude-haiku-4-5'
 *   thinkingLevel  PI_THINKING                 > file.thinkingLevel  > 'low'
 *   baseUrl        ANTHROPIC_BASE_URL          > file.baseUrl        > null（SDK 官方端点）
 *
 * 凭据安全：本模块只持久化端点与模型 id，绝不写 API key（key 仅走 env，见 agent.ts）。
 * .pi/config.json 写入时 chmod 600（仅 owner 可读写）。
 * 配置写盘路径：仓库根 .pi/config.json（可用 PI_CONFIG_PATH 覆盖，测试/部署用）。
 */

export const DEFAULT_PROVIDER = 'anthropic';
export const DEFAULT_MODEL_ID = 'claude-haiku-4-5';
export const DEFAULT_THINKING_LEVEL = 'low';
/** 允许的 thinking 级别（与 pi SDK createAgentSession thinkingLevel 对齐）。 */
export const THINKING_LEVELS = ['off', 'low', 'medium', 'high'] as const;

/** .pi/config.json 落盘字段（与代码默认值互补，不含任何凭据）。 */
export interface ProviderConfigFile {
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
  baseUrl?: string | null;
}

/** 配置来源：env > file > default。 */
export type ConfigSourceKind = 'env' | 'file' | 'default';

/** 当前生效配置 + 每字段来源说明。 */
export interface EffectiveConfig {
  provider: string;
  modelId: string;
  thinkingLevel: string;
  baseUrl: string | null;
  source: Record<'provider' | 'modelId' | 'thinkingLevel' | 'baseUrl', ConfigSourceKind>;
  /** 落盘的 .pi/config.json 内容（未修改过时为空对象）。 */
  file: ProviderConfigFile;
}

/** .pi/config.json 路径（可用 PI_CONFIG_PATH 覆盖，测试/部署用）。 */
export function getConfigPath(): string {
  return process.env.PI_CONFIG_PATH?.trim() || path.join(REPO_ROOT, '.pi', 'config.json');
}

/** 读取落盘配置；文件缺失 / JSON 解析失败时返回空对象（不抛错）。 */
export async function readFileConfig(): Promise<ProviderConfigFile> {
  try {
    const raw = await readFile(getConfigPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as ProviderConfigFile;
    }
  } catch {
    // 文件缺失或损坏 → 视为无配置
  }
  return {};
}

/** 计算当前生效配置（env > file > default）并附带每字段来源。 */
export async function getEffectiveConfig(): Promise<EffectiveConfig> {
  const file = await readFileConfig();

  const envModelId = process.env.PI_MODEL?.trim() || '';
  const envThinking = process.env.PI_THINKING?.trim() || '';
  const envBaseUrl = process.env.ANTHROPIC_BASE_URL?.trim() || '';

  const fileModelId = file.modelId?.trim() || '';
  const fileThinking = file.thinkingLevel?.trim() || '';
  const fileBaseUrl = file.baseUrl?.trim() || '';

  return {
    provider: file.provider?.trim() || DEFAULT_PROVIDER,
    modelId: envModelId || fileModelId || DEFAULT_MODEL_ID,
    thinkingLevel: envThinking || fileThinking || DEFAULT_THINKING_LEVEL,
    baseUrl: envBaseUrl || fileBaseUrl || null,
    source: {
      provider: file.provider?.trim() ? 'file' : 'default',
      modelId: envModelId ? 'env' : fileModelId ? 'file' : 'default',
      thinkingLevel: envThinking ? 'env' : fileThinking ? 'file' : 'default',
      baseUrl: envBaseUrl ? 'env' : fileBaseUrl ? 'file' : 'default',
    },
    file,
  };
}

/** PUT /api/config 的合法字段补丁。 */
export interface ConfigPatch {
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
  baseUrl?: string | null;
}

/** 校验并归一化 PUT /api/config 的 body：返回 { patch } 或 { error }。 */
export function normalizePatch(body: Record<string, unknown>): { patch: ConfigPatch } | { error: string } {
  const patch: ConfigPatch = {};

  if (body.provider !== undefined) {
    const v = typeof body.provider === 'string' ? body.provider.trim() : '';
    if (!v) return { error: 'provider 不能为空' };
    patch.provider = v;
  }
  if (body.modelId !== undefined) {
    const v = typeof body.modelId === 'string' ? body.modelId.trim() : '';
    if (!v) return { error: 'modelId 不能为空' };
    patch.modelId = v;
  }
  if (body.thinkingLevel !== undefined) {
    const v = typeof body.thinkingLevel === 'string' ? body.thinkingLevel.trim() : '';
    if (!(THINKING_LEVELS as readonly string[]).includes(v)) {
      return { error: `thinkingLevel 仅支持：${THINKING_LEVELS.join(' / ')}` };
    }
    patch.thinkingLevel = v;
  }
  if (body.baseUrl !== undefined) {
    if (body.baseUrl === null) {
      patch.baseUrl = null; // 显式清除
    } else {
      const v = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
      if (v && !/^https?:\/\//.test(v)) {
        return { error: 'baseUrl 需以 http:// 或 https:// 开头' };
      }
      patch.baseUrl = v || null;
    }
  }

  return { patch };
}

/**
 * 合并写入 .pi/config.json（保留未涉及的已有字段），写入后 chmod 600。
 * 空字符串 / null 字段按"清除"处理：从文件删除对应键。
 */
export async function saveProviderConfig(patch: ConfigPatch): Promise<ProviderConfigFile> {
  const current = await readFileConfig();
  const next: ProviderConfigFile = { ...current, ...patch };

  if (next.baseUrl === null || next.baseUrl === '') delete next.baseUrl;
  for (const key of ['provider', 'modelId', 'thinkingLevel'] as const) {
    const v = next[key];
    if (v !== undefined && v.trim() === '') delete next[key];
  }

  const json = JSON.stringify(next, null, 2) + '\n';
  const configPath = getConfigPath();
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, json, 'utf8');
  // 已有文件时 writeFile 的 mode 不生效，写入后统一 chmod 600。
  await chmod(configPath, 0o600).catch(() => {});
  return next;
}
