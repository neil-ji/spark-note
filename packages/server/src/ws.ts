import websocketPlugin from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

/** WebSocket 连接处于 OPEN 状态。*/
const OPEN = 1;

/**
 * 单用户 WebSocket 连接集线器：
 * 维护连接集合，提供 send / broadcast / 计数，供后续 agent 流式事件推送复用。
 */
class WsHub {
  private sockets = new Set<WebSocket>();

  add(socket: WebSocket): void {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
  }

  get size(): number {
    return this.sockets.size;
  }

  send(socket: WebSocket, type: string, payload?: unknown): void {
    if (socket.readyState === OPEN) {
      socket.send(JSON.stringify({ type, payload, ts: Date.now() }));
    }
  }

  broadcast(type: string, payload?: unknown): void {
    const message = JSON.stringify({ type, payload, ts: Date.now() });
    for (const socket of this.sockets) {
      if (socket.readyState === OPEN) socket.send(message);
    }
  }
}

export const wsHub = new WsHub();

/** 客户端可发送的消息类型。*/
export type WsClientMessage =
  | { type: 'ping' }
  | { type: 'echo'; payload?: unknown }
  | { type: 'broadcast'; payload?: unknown };

/**
 * 注册 WebSocket 基础设施路由：GET /ws。
 *
 * 握手后立即推送 `ready`（含当前连接数）；随后响应 ping/echo/broadcast 三类消息，
 * 作为后续对话流式事件推送的骨架。
 */
export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  await app.register(websocketPlugin);
  app.get('/ws', { websocket: true }, (socket) => {
    wsHub.add(socket);
    wsHub.send(socket, 'ready', { connections: wsHub.size });

    socket.on('message', (raw) => {
      let message: Partial<WsClientMessage>;
      try {
        message = JSON.parse(String(raw));
      } catch {
        wsHub.send(socket, 'error', { message: 'invalid json' });
        return;
      }

      switch (message.type) {
        case 'ping':
          wsHub.send(socket, 'pong', { ts: Date.now() });
          break;
        case 'echo':
          wsHub.send(socket, 'echo', message.payload ?? null);
          break;
        case 'broadcast':
          wsHub.broadcast('broadcast', message.payload ?? null);
          break;
        default:
          wsHub.send(socket, 'error', { message: `unknown type: ${String(message.type)}` });
      }
    });
  });
}
