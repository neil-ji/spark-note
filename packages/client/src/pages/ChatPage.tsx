import { useEffect, useRef, useState } from 'react';
import { useChat } from '../hooks/useChat';
import type { ChatItem, ToolCallItem } from '../lib/chat';

/**
 * 对话页：流式渲染 pi agent 的文本 / 思考 / 工具调用，支持 abort 中断。
 *
 * 事件经 WebSocket 由后端转发（useChat → chatReducer），消息列表按角色分栏展示：
 * 用户（深色气泡）与助手（浅色气泡：思考过程可折叠 + 工具调用卡片 + 流式文本）。
 */

const WS_LABEL: Record<string, string> = {
  connecting: '连接中…',
  open: '已连接',
  closed: '已断开',
};

const WS_STYLE: Record<string, string> = {
  connecting: 'bg-amber-100 text-amber-700',
  open: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-red-100 text-red-700',
};

const AGENT_LABEL: Record<string, string> = {
  initializing: '初始化 agent…',
  idle: '空闲',
  streaming: '运行中…',
  error: '出错',
};

const AGENT_STYLE: Record<string, string> = {
  initializing: 'bg-amber-100 text-amber-700',
  idle: 'bg-emerald-100 text-emerald-700',
  streaming: 'bg-sky-100 text-sky-700 animate-pulse',
  error: 'bg-red-100 text-red-700',
};

/** 工具调用卡片：名称徽标 + 参数（可折叠）+ 运行/结果状态。 */
function ToolCallCard({ tool }: { tool: ToolCallItem }) {
  const statusMeta =
    tool.status === 'running'
      ? { label: '运行中…', style: 'text-sky-600', dot: 'animate-pulse bg-sky-500' }
      : tool.status === 'error'
        ? { label: '失败', style: 'text-red-600', dot: 'bg-red-500' }
        : { label: '完成', style: 'text-emerald-600', dot: 'bg-emerald-500' };

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${statusMeta.dot}`} />
        <span className="font-mono text-xs font-semibold text-neutral-800">{tool.name}</span>
        <span className={`ml-auto text-xs ${statusMeta.style}`}>{statusMeta.label}</span>
      </div>
      {tool.args && (
        <details className="border-t border-neutral-100">
          <summary className="cursor-pointer select-none px-3 py-1 text-xs text-neutral-500 hover:text-neutral-700">
            参数
          </summary>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all px-3 pb-2 font-mono text-xs text-neutral-600">
            {tool.args}
          </pre>
        </details>
      )}
      {tool.result !== undefined && (
        <details className="border-t border-neutral-100">
          <summary className="cursor-pointer select-none px-3 py-1 text-xs text-neutral-500 hover:text-neutral-700">
            结果{tool.status === 'error' ? '（出错）' : ''}
          </summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all px-3 pb-2 font-mono text-xs text-neutral-600">
            {tool.result || '（空）'}
          </pre>
        </details>
      )}
    </div>
  );
}

/** 单条消息气泡。 */
function MessageBubble({ item }: { item: ChatItem }) {
  if (item.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-neutral-900 px-4 py-2.5 text-sm leading-relaxed text-white whitespace-pre-wrap">
          {item.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-neutral-100 px-4 py-2.5 text-sm leading-relaxed text-neutral-900">
        {item.thinking && (
          <details className="mb-1.5 rounded-lg bg-white/70">
            <summary className="cursor-pointer select-none px-2 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-700">
              思考过程
            </summary>
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap px-2 pb-2 font-mono text-xs text-neutral-500">
              {item.thinking}
            </pre>
          </details>
        )}

        {item.tools.map((tool) => (
          <ToolCallCard key={tool.id} tool={tool} />
        ))}

        {item.text && <p className="whitespace-pre-wrap">{item.text}</p>}

        {item.status === 'streaming' && !item.text && (
          <span className="text-neutral-400">正在思考…</span>
        )}

        {item.error && <p className="mt-1 text-xs text-red-600">出错：{item.error}</p>}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { items, status, model, thinkingLevel, skills, queued, wsStatus, canSend, sendMessage, abort } = useChat();
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // 新内容到达时滚动到底部。
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  const streaming = status === 'streaming';

  const handleSend = () => {
    if (sendMessage(input)) setInput('');
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-3xl flex-col gap-4">
      {/* 顶栏：连接状态 / agent 状态 / 模型信息 / abort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold">智能体对话</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            {model ? `模型 ${model} · thinking ${thinkingLevel}` : '对话式驱动 agent 调 SKILL 产出内容'}
          </p>
        </div>
        {skills.length > 0 && (
          <span className="hidden text-xs text-neutral-400 sm:inline">skills: {skills.join(' / ')}</span>
        )}
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${WS_STYLE[wsStatus]}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          WebSocket {WS_LABEL[wsStatus]}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${AGENT_STYLE[status]}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {AGENT_LABEL[status]}
        </span>
        {streaming && (
          <button
            onClick={abort}
            className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
          >
            中断
          </button>
        )}
      </div>

      {/* 消息列表 */}
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-4">
        {items.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-sm text-neutral-400">发一条消息开始对话，例如：</p>
            <p className="mt-2 text-sm text-neutral-500">「GitHub trending 这周有什么好项目？」</p>
            <p className="text-sm text-neutral-500">「用 tingguo-weekly 产出一期《听过》周刊」</p>
          </div>
        )}
        {items.map((item) => (
          <MessageBubble key={item.id} item={item} />
        ))}
        {queued.length > 0 && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            已排队 {queued.length} 条消息，将在当前运行结束后处理。
          </div>
        )}
        {status === 'error' && !streaming && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            会话出错（{model || 'agent 未初始化'}）。请检查后端与模型配置后重试。
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          placeholder={canSend ? '输入消息，Enter 发送，Shift+Enter 换行。运行中发送会自动排队。' : 'WebSocket 未连接…'}
          disabled={!canSend}
          className="flex-1 resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!canSend || !input.trim()}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          发送
        </button>
      </div>
    </div>
  );
}
