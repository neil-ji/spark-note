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
