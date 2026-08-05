import { useEffect, useReducer } from 'react';
import { useWebSocket } from './useWebSocket';
import {
  chatReducer,
  initialChatState,
  type AgentStateSnapshot,
  type AgentWsEvent,
} from '../lib/chat';

/**
 * 对话会话 hook：连接 /ws，把后端推送的 session 快照与归一化 agent 事件
 * 折叠进 chatReducer，并暴露 send / abort。
 */
export function useChat() {
  const { status: wsStatus, lastMessage, send } = useWebSocket('/ws');
  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === 'session') {
      dispatch({ type: 'snapshot', snapshot: lastMessage.payload as AgentStateSnapshot });
    } else if (lastMessage.type === 'agent_event') {
      dispatch({ type: 'event', event: lastMessage.payload as AgentWsEvent });
    } else if (lastMessage.type === 'error') {
      const message =
        lastMessage.payload && typeof lastMessage.payload === 'object'
          ? String((lastMessage.payload as { message?: unknown }).message ?? '')
          : '后端错误';
      dispatch({ type: 'event', event: { kind: 'agent_error', message } });
    }
  }, [lastMessage]);

  const canSend = wsStatus === 'open';

  /** 发送一条用户消息；未连接时不动作。流式期间后端会自动 followUp 排队。 */
  const sendMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !canSend) return false;
    dispatch({ type: 'send', text: trimmed });
    send('chat', { text: trimmed });
    return true;
  };

  /** 中断当前 agent 运行。 */
  const abort = () => {
    send('abort');
  };

  return { ...state, wsStatus, canSend, sendMessage, abort };
}
