import { useCallback, useEffect, useRef, useState } from 'react';

export type WsStatus = 'connecting' | 'open' | 'closed';

/** 后端 WebSocket 推送的消息信封。 */
export interface WsEnvelope<T = unknown> {
  type: string;
  payload?: T;
  ts?: number;
}

const RECONNECT_DELAY_MS = 1500;

/**
 * 连接后端 WebSocket（经 Vite proxy 转发到 Fastify /ws）。
 * 返回连接状态、最近一条消息与 send()。
 *
 * 断线后自动重连（服务端会话单例，多轮对话在服务端保持；重连后服务端会推送
 * 新的 session 快照同步状态）。
 */
export function useWebSocket(path: string) {
  const [status, setStatus] = useState<WsStatus>('connecting');
  const [lastMessage, setLastMessage] = useState<WsEnvelope | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${protocol}://${window.location.host}${path}`);
      socketRef.current = socket;
      setStatus('connecting');

      socket.onopen = () => setStatus('open');
      socket.onmessage = (event) => {
        try {
          setLastMessage(JSON.parse(String(event.data)) as WsEnvelope);
        } catch {
          setLastMessage({ type: 'raw', payload: event.data });
        }
      };
      socket.onclose = () => {
        if (disposedRef.current) return;
        setStatus('closed');
        reconnectTimerRef.current = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };
      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    return () => {
      disposedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, [path]);

  const send = useCallback((type: string, payload?: unknown) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, payload }));
    }
  }, []);

  return { status, lastMessage, send };
}
