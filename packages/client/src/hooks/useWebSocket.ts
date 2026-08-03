import { useCallback, useEffect, useRef, useState } from 'react';

export type WsStatus = 'connecting' | 'open' | 'closed';

/** 后端 WebSocket 推送的消息信封。 */
export interface WsEnvelope<T = unknown> {
  type: string;
  payload?: T;
  ts?: number;
}

/**
 * 连接后端 WebSocket（经 Vite proxy 转发到 Fastify /ws）。
 * 返回连接状态、最近一条消息与 send()，作为对话流式事件的基础设施骨架。
 */
export function useWebSocket(path: string) {
  const [status, setStatus] = useState<WsStatus>('connecting');
  const [lastMessage, setLastMessage] = useState<WsEnvelope | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}${path}`);
    socketRef.current = socket;

    socket.onopen = () => setStatus('open');
    socket.onclose = () => setStatus('closed');
    socket.onerror = () => setStatus('closed');
    socket.onmessage = (event) => {
      try {
        setLastMessage(JSON.parse(String(event.data)) as WsEnvelope);
      } catch {
        setLastMessage({ type: 'raw', payload: event.data });
      }
    };

    return () => {
      socket.close();
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
