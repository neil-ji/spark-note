import { useEffect, useReducer, useRef, useState } from 'react';
import { useWebSocket, type WsEnvelope } from './useWebSocket';
import { getConversationMessages } from '../lib/api';
import {
  chatReducer,
  initialChatState,
  type AgentStateSnapshot,
  type AgentWsEvent,
} from '../lib/chat';

/**
 * 对话会话 hook：连接 /ws（支持 `?conversation=<id>` 会话切换），把后端推送的
 * session 快照与归一化 agent 事件折叠进 chatReducer，并暴露 send / abort。
 *
 * conversationId 变化时：清空聊天区 → 从 REST 加载该会话历史消息 → 重连 WS 到该会话。
 * 服务端广播所有会话的事件（带 conversationId 信封），这里按当前会话过滤，避免串扰。
 */
export function useChat(conversationId: string | null, onSettled?: () => void) {
  const path = conversationId ? `/ws?conversation=${encodeURIComponent(conversationId)}` : '/ws';
  const { status: wsStatus, lastMessage, send } = useWebSocket(path);
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  // 历史消息加载中：期间禁止发送，避免「先发后 load history 覆盖」的竞态（P2-4）。
  const [historyLoading, setHistoryLoading] = useState(false);

  // onSettled 用 ref 保存，避免其身份变化触发事件消费 effect 重跑（重放 lastMessage）。
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  // 切换会话：清空聊天区，并从 REST 加载该会话历史消息。
  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'reset', conversationId });
    if (!conversationId) return;
    setHistoryLoading(true);
    getConversationMessages(conversationId)
      .then(({ messages }) => {
        if (!cancelled) dispatch({ type: 'history', conversationId, messages });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        dispatch({ type: 'event', event: { kind: 'agent_error', message: `加载历史消息失败：${message}` } });
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // 消费后端推送信封；非当前会话的广播丢弃。
  useEffect(() => {
    if (!lastMessage) return;
    const envelope = lastMessage as WsEnvelope & { conversationId?: string };
    // 会话元信息变化（自动命名完成后下发新标题）：任何会话都触发列表刷新，不受当前会话过滤。
    if (envelope.type === 'conversation_updated') {
      onSettledRef.current?.();
      return;
    }
    if (envelope.conversationId && envelope.conversationId !== conversationId) return;
    if (envelope.type === 'session') {
      dispatch({ type: 'snapshot', snapshot: envelope.payload as AgentStateSnapshot });
    } else if (envelope.type === 'agent_event') {
      const event = envelope.payload as AgentWsEvent;
      dispatch({ type: 'event', event });
      if (event.kind === 'agent_settled') onSettledRef.current?.();
    } else if (envelope.type === 'error') {
      const message =
        envelope.payload && typeof envelope.payload === 'object'
          ? String((envelope.payload as { message?: unknown }).message ?? '')
          : '后端错误';
      dispatch({ type: 'event', event: { kind: 'agent_error', message } });
    }
  }, [lastMessage, conversationId]);

  // 历史加载期间禁止发送（canSend=false），从根上杜绝「history 覆盖已发消息」竞态。
  const canSend = wsStatus === 'open' && Boolean(conversationId) && !historyLoading;

  /** 发送一条用户消息到当前会话；未连接或无会话时不动作。流式期间后端会自动 followUp 排队。 */
  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !canSend) return false;
    dispatch({ type: 'send', text: trimmed });
    send('chat', conversationId ? { text: trimmed, conversationId } : { text: trimmed });
    return true;
  };

  /** 中断当前会话的 agent 运行。 */
  const abort = () => {
    send('abort', conversationId ? { conversationId } : undefined);
  };

  return { ...state, wsStatus, canSend, historyLoading, sendMessage, abort };
}
