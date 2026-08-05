import websocketPlugin from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import {
  abortRun,
  agentEvents,
  getSessionSnapshot,
  sendPrompt,
  sessionStates,
} from './agent.js';

/** WebSocket 连接处于 OPEN 状态。*/
const OPEN = 1;

/**
 * 单用户 WebSocket 连接集线器：
 * 维护连接集合，提供 send / broadcast / 计数，用于 agent 流式事件推送。
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

/** 客户端可发送的消息类型。 */
export type WsClientMessage =
  | { type: 'ping' }
  | { type: 'echo'; payload?: unknown }
  | { type: 'broadcast'; payload?: unknown }
  | { type: 'chat'; payload?: { text?: unknown } }
  | { type: 'abort' };

/** 提取 chat 消息文本，非字符串返回空串。 */
function chatText(payload: unknown): string {
  if (payload && typeof payload === 'object' && typeof (payload as { text?: unknown }).text === 'string') {
    return (payload as { text?: unknown }).text as string;
  }
  return '';
}

/** 统一错误文案。 */
function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// agent 事件 → 所有连接广播（单用户：所有标签页共享同一会话）。attach 幂等。
let agentForwardingAttached = false;
function attachAgentForwarding(): void {
  if (agentForwardingAttached) return;
  agentForwardingAttached = true;
  agentEvents.subscribe((event) => wsHub.broadcast('agent_event', event));
  sessionStates.subscribe((state) => wsHub.broadcast('session', state));
}

/**
 * 注册 WebSocket 路由：GET /ws。
 *
 * - 握手后推送 `ready` + 当前会话快照 `session`
 * - 响应 ping/echo/broadcast（基础设施）
 * - `chat`：发送消息给 pi agent（流式事件经 agent_event 广播回客户端）
 * - `abort`：中断当前 agent 运行
 */
export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  attachAgentForwarding();
  await app.register(websocketPlugin);
  app.get('/ws', { websocket: true }, async (socket) => {
    wsHub.add(socket);
    wsHub.send(socket, 'ready', { connections: wsHub.size });
    wsHub.send(socket, 'session', await getSessionSnapshot());

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
        case 'chat': {
          const text = chatText(message.payload);
          if (!text.trim()) {
            wsHub.send(socket, 'error', { message: 'empty chat text' });
            break;
          }
          // 不阻塞消息循环：prompt 期间 socket 仍能收到 abort。
          sendPrompt(text).catch((err) => wsHub.broadcast('error', { message: errMessage(err) }));
          break;
        }
        case 'abort':
          abortRun().catch((err) => wsHub.broadcast('error', { message: errMessage(err) }));
          break;
        default:
          wsHub.send(socket, 'error', { message: `unknown type: ${String(message.type)}` });
      }
    });
  });
}
