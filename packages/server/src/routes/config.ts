import type { FastifyInstance } from 'fastify';
import {
  getConfigPath,
  getEffectiveConfig,
  normalizePatch,
  saveProviderConfig,
} from '../provider-config.js';

/**
 * Provider/Model 配置 API：
 *   GET /api/config → 当前生效配置（provider / modelId / thinkingLevel / baseUrl）+ 每字段来源
 *   PUT /api/config → 写入 .pi/config.json（合并语义，权限 600），重启后端后生效
 *
 * 优先级：env > .pi/config.json > 代码默认值（见 provider-config.ts）。
 * 真实 API key 不落盘（仅 env），本 API 只持久化端点与模型 id。
 */
export async function registerConfigRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/config', async () => {
    const cfg = await getEffectiveConfig();
    return {
      provider: cfg.provider,
      modelId: cfg.modelId,
      thinkingLevel: cfg.thinkingLevel,
      baseUrl: cfg.baseUrl,
      source: cfg.source,
      file: cfg.file,
      configPath: getConfigPath(),
    };
  });

  app.put<{ Body: Record<string, unknown> }>('/api/config', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = normalizePatch(body);
    if ('error' in result) {
      reply.code(400);
      return { error: result.error };
    }

    const saved = await saveProviderConfig(result.patch);
    const cfg = await getEffectiveConfig();
    const configPath = getConfigPath();
    return {
      provider: cfg.provider,
      modelId: cfg.modelId,
      thinkingLevel: cfg.thinkingLevel,
      baseUrl: cfg.baseUrl,
      source: cfg.source,
      file: saved,
      configPath,
      saved: true,
      note: `配置已保存到 ${configPath}，重启后端后生效`,
    };
  });
}
