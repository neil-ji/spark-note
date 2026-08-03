import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { CLIENT_DIST, HOST, SERVER_PORT } from './config.js';
import { registerWebSocket, wsHub } from './ws.js';

/** 组装 Fastify 实例：健康检查 API、WebSocket 基础设施、前端静态资源托管。 */
export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  // 健康检查 API —— 浏览器前端页直接调用，返回 ok。
  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'spark-note',
    wsConnections: wsHub.size,
    ts: Date.now(),
  }));

  // WebSocket 服务基础设施（/ws）
  await registerWebSocket(app);

  // 静态资源服务：托管前端 build 产物（packages/client/dist）。
  // dev 模式下由 Vite dev server 提供页面；仅 build 后 dist 存在时才注册。
  if (existsSync(CLIENT_DIST)) {
    app.register(staticPlugin, { root: CLIENT_DIST, prefix: '/', wildcard: false });

    // SPA 回退：非 API/WS 路由一律返回 index.html。
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
        reply.code(404).send({ error: 'not found' });
        return;
      }
      reply.sendFile('index.html');
    });
  }

  return app;
}

async function main(): Promise<void> {
  const app = await buildServer();
  try {
    await app.listen({ port: SERVER_PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// 仅当作为入口直接运行（node dist/index.js / tsx src/index.ts）时启动服务；
// 被测试 import 时不产生副作用，避免事件循环挂起。
const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main();
}
