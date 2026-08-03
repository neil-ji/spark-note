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
