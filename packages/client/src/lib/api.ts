/** 后端 API 客户端。所有请求经 Vite dev proxy 转发到 Fastify 后端（/api -> localhost:{PORT}）。 */

export interface HealthResponse {
  status: 'ok';
  service: string;
  wsConnections: number;
  ts: number;
}

/** 健康检查：浏览器前端页可直接调用后端返回 ok。 */
export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new Error(`health check failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as HealthResponse;
}

/* ---- Writing DNA 数据 API ---- */

/** 服务端解析出的结构化块（kind 与 packages/server 的 DnaBlock 保持一致）。 */
export type DnaBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'table'; headers: string[]; rows: string[][] };

/** 规则对照清单条目（id 稳定，用于勾选状态持久化）。 */
export interface RuleItem {
  id: string;
  text: string;
}

/** 规则对照清单分组（核心规则 / 负面约束）。 */
export interface ChecklistGroup {
  id: string;
  label: string;
  items: RuleItem[];
}

export interface DnaDocMeta {
  slug: string;
  title: string;
  fileName: string;
  blockCount: number;
}

export interface DnaDocDetail {
  slug: string;
  title: string;
  fileName: string;
  blocks: DnaBlock[];
  checklist?: ChecklistGroup[];
}

/** 列出 .claude/writing-dna/ 下全部文档。 */
export async function listWritingDna(): Promise<{ docs: DnaDocMeta[] }> {
  const res = await fetch('/api/writing-dna');
  if (!res.ok) {
    throw new Error(`list writing-dna failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as { docs: DnaDocMeta[] };
}

/** 获取单个文档的结构化渲染数据与规则对照清单（仅主文档带 checklist）。 */
export async function getWritingDna(slug: string): Promise<{ doc: DnaDocDetail }> {
  const res = await fetch(`/api/writing-dna/${encodeURIComponent(slug)}`);
  if (!res.ok) {
    throw new Error(`get writing-dna "${slug}" failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as { doc: DnaDocDetail };
}

/* ---- 内容管理数据 API ---- */

/** 单期元信息（字段与 packages/server 的 ContentIssueMeta 保持一致）。 */
export interface ContentIssue {
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

/** 列出《听过》各期内容元信息（文稿 / HTML / PNG 均只读）。 */
export async function listContentIssues(): Promise<{ issues: ContentIssue[] }> {
  const res = await fetch('/api/content/issues');
  if (!res.ok) {
    throw new Error(`list content issues failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as { issues: ContentIssue[] };
}

/* ---- Provider / Model 配置 API ---- */

/** 配置来源：env > .pi/config.json > 代码默认值。 */
export type ConfigSourceKind = 'env' | 'file' | 'default';

/** 当前生效配置 + 每字段来源说明（字段与 packages/server 的 EffectiveConfig 保持一致）。 */
export interface ConfigResponse {
  provider: string;
  modelId: string;
  thinkingLevel: string;
  baseUrl: string | null;
  source: Record<'provider' | 'modelId' | 'thinkingLevel' | 'baseUrl', ConfigSourceKind>;
  /** 落盘的 .pi/config.json 内容（未修改过时为空对象）。 */
  file?: Record<string, unknown>;
  /** 配置写盘路径。 */
  configPath?: string;
  saved?: boolean;
  note?: string;
}

/** 读取当前生效的 Provider/Model 配置。 */
export async function getConfig(): Promise<ConfigResponse> {
  const res = await fetch('/api/config');
  if (!res.ok) {
    throw new Error(`get config failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ConfigResponse;
}

/** 保存配置补丁到 .pi/config.json（重启后端后生效）。 */
export async function saveConfig(patch: {
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
  baseUrl?: string | null;
}): Promise<ConfigResponse> {
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const body = (await res.json()) as ConfigResponse & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `save config failed: ${res.status} ${res.statusText}`);
  }
  return body;
}
