import { useEffect, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

interface LogEntry {
  key: number;
  direction: 'out' | 'in';
  type: string;
  payload?: unknown;
}

/**
 * 对话页骨架。
 *
 * 当前阶段打通链路：输入框 → WebSocket echo → 后端返回，验证 /ws 基础设施可用。
 * 后续接入 pi 的 agent 会话后，这里改为流式渲染文本/思考/工具调用事件。
 */
export default function ChatPage() {
  const { status, lastMessage, send } = useWebSocket('/ws');
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    send('echo', { text });
    setLogs((prev) => [...prev, { key: Date.now(), direction: 'out', type: 'echo', payload: { text } }]);
    setInput('');
  };

  // 收到的 WebSocket 消息 → 追加到对话日志
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'echo') {
      setLogs((prev) => [...prev, { key: Date.now(), direction: 'in', type: 'echo', payload: lastMessage.payload }]);
    }
  }, [lastMessage]);

  const statusStyle = {
    connecting: 'bg-amber-100 text-amber-700',
    open: 'bg-emerald-100 text-emerald-700',
    closed: 'bg-red-100 text-red-700',
  }[status];

  const statusLabel = {
    connecting: '连接中…',
    open: '已连接',
    closed: '已断开',
  }[status];

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">智能体对话</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            对话式驱动 agent 调 SKILL 产出内容（骨架阶段：WebSocket echo 链路已验证）
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          WebSocket {statusLabel}
        </span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-4">
        {logs.length === 0 && (
          <p className="text-sm text-neutral-400">发一条消息试试——会经 WebSocket 后端 echo 回来。</p>
        )}
        {logs.map((log) => (
          <div
            key={log.key}
            className={`rounded-md px-3 py-2 text-sm ${
              log.direction === 'out'
                ? 'ml-auto max-w-[80%] bg-neutral-900 text-white'
                : 'mr-auto max-w-[80%] bg-neutral-100 text-neutral-900'
            }`}
          >
            <span className="mr-2 text-xs opacity-60">
              {log.direction === 'out' ? '→' : '←'} {log.type}
            </span>
            {typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload)}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="输入消息，通过 WebSocket echo…"
          className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          发送
        </button>
      </div>
    </div>
  );
}
