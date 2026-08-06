import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { useChat } from '../hooks/useChat';
import { useTypewriter } from '../hooks/useTypewriter';
import {
  createConversation,
  deleteConversation,
  listConversations,
  renameConversation,
  type Conversation,
} from '../lib/api';
import type { ChatItem, ToolCallItem } from '../lib/chat';
import { Markdown } from '../lib/markdown';
import { IconCheck, IconCopy, IconX } from '../components/icons';
import ConversationSidebar from '../components/ConversationSidebar';

/**
 * 对话页：会话侧栏（新建/切换/重命名/删除）+ 流式渲染 pi agent 的文本 / 思考 / 工具调用。
 *
 * 事件经 WebSocket 由后端转发（useChat → chatReducer），消息列表按角色分栏展示：
 * 用户（深色气泡）与助手（浅色气泡：思考过程可折叠 + 工具调用卡片 + 流式文本）。
 * 切换会话时 useChat 重连 /ws?conversation=<id> 并加载历史消息。
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

/** 打字机流式光标：CSS 块状光标（非 emoji 字符）。 */
const TypewriterCursor = forwardRef<HTMLSpanElement>(function TypewriterCursor(_props, ref) {
  return <span ref={ref} aria-hidden="true" className="typewriter-cursor" />;
});

/** 复制文本到剪贴板：优先 navigator.clipboard（需安全上下文），失败降级 execCommand。 */
async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 权限被拒 / 非安全上下文等 → 走降级路径
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** 消息气泡复制按钮：hover 显示（移动端可聚焦），点击复制完整原文（与 reveal 进度无关），
 *  成功短暂显示对勾，两条剪贴板路径都失败时显示失败态作为提示。 */
function MessageCopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<number | null>(null);

  // 卸载时清理计时器，避免卸载后 setState。
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleCopy = () => {
    void copyTextToClipboard(text).then((ok) => {
      setState(ok ? 'copied' : 'failed');
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setState('idle'), 1200);
    });
  };

  const label = state === 'copied' ? '已复制' : state === 'failed' ? '复制失败' : '复制消息';

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label}
      aria-label={label}
      className="mt-1 shrink-0 rounded-md p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-200/70 hover:text-neutral-700 focus:opacity-100 focus-visible:outline-none group-hover:opacity-100"
    >
      {state === 'copied' ? (
        <IconCheck className="h-3.5 w-3.5 text-emerald-500" />
      ) : state === 'failed' ? (
        <IconX className="h-3.5 w-3.5 text-red-500" />
      ) : (
        <IconCopy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/** 单条消息气泡。 */
function MessageBubble({ item }: { item: ChatItem }) {
  // 打字机式流式浮现：仅实时流式的助手消息有逐字 reveal + 块状光标；
  // 历史回显 / 已完成的用户与助手消息（含 abort 后）直接全文停驻、无光标。
  // 助手消息的 display 是 markdown 源文本的 reveal 进度，渲染层按该进度渲染富文本
  // （lib/markdown.tsx 的 parseBlocks 对未闭合围栏/粗体等增量输入容错，不会抛错）。
  const typewriting = item.role === 'assistant' && item.status === 'streaming';
  const { display, showCursor } = useTypewriter(item.text, typewriting);
  const cursorRef = useRef<HTMLSpanElement>(null);

  // 流式期间保持光标在可视区内：reveal 推进把光标推出滚动容器外时滚动回视。
  useEffect(() => {
    if (showCursor && cursorRef.current) {
      cursorRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [showCursor, display]);

  if (item.role === 'user') {
    return (
      <div className="group flex items-start justify-end gap-1">
        <MessageCopyButton text={item.text} />
        <div className="max-w-[85%] min-w-0 rounded-2xl rounded-tr-sm bg-neutral-900 px-4 py-2.5 text-sm leading-relaxed text-white whitespace-pre-wrap">
          {item.text}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start justify-start gap-1">
      <div className="max-w-[92%] min-w-0 rounded-2xl rounded-tl-sm bg-neutral-100 px-4 py-2.5 text-sm leading-relaxed text-neutral-900">
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

        {item.text && (
          <>
            {/* 助手文本按 reveal 进度渲染为流式安全的富文本（.dna-prose 沿用 Writing DNA 排版体系） */}
            <Markdown markdown={display} className="dna-prose" />
            {showCursor && <TypewriterCursor ref={cursorRef} />}
          </>
        )}

        {item.status === 'streaming' && !item.text && (
          <span className="text-neutral-400">正在思考…</span>
        )}

        {item.error && <p className="mt-1 text-xs text-red-600">出错：{item.error}</p>}
      </div>
      {item.text && <MessageCopyButton text={item.text} />}
    </div>
  );
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  /** 重新拉取会话列表（新建 / 重命名 / 删除 / 一轮对话落盘后刷新标题与时间）。 */
  const refreshConversations = useCallback(async (): Promise<Conversation[]> => {
    const { conversations } = await listConversations();
    setConversations(conversations);
    return conversations;
  }, []);

  // 首次加载：拉取会话列表并选中最近一个。
  useEffect(() => {
    let cancelled = false;
    listConversations()
      .then(({ conversations }) => {
        if (cancelled) return;
        setConversations(conversations);
        setActiveId((prev) => prev ?? conversations[0]?.id ?? null);
      })
      .catch(() => {
        // 列表加载失败静默降级：聊天区仍可用（首次对话由后端建默认会话）。
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chat = useChat(activeId, refreshConversations);
  const { items, status, model, thinkingLevel, skills, queued, wsStatus, canSend, sendMessage, abort } = chat;

  const streaming = status === 'streaming';

  // 新内容到达时滚动到底部。
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  const handleSend = () => {
    if (sendMessage(input)) {
      setInput('');
      // 首条消息后会话标题/时间由 agent_settled 刷新；这里先乐观刷新一次。
      refreshConversations().catch(() => {});
    }
  };

  const handleCreate = async () => {
    setActionError(null);
    try {
      const { id } = await createConversation();
      await refreshConversations();
      setActiveId(id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRename = async (id: string, name: string) => {
    setActionError(null);
    try {
      await renameConversation(id, name);
      await refreshConversations();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    try {
      await deleteConversation(id);
      const list = await refreshConversations();
      // 删除的正是当前会话 → 切到最近一个；否则保持当前会话。
      setActiveId((prev) =>
        prev && prev !== id && list.some((c) => c.id === prev) ? prev : list[0]?.id ?? null,
      );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const placeholder = !activeId
    ? '请先在左侧新建会话'
    : canSend
      ? '输入消息，Enter 发送，Shift+Enter 换行。运行中发送会自动排队。'
      : 'WebSocket 未连接…';

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-4">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeId}
        loading={listLoading}
        onSelect={setActiveId}
        onCreate={handleCreate}
        onRename={handleRename}
        onDelete={handleDelete}
      />

      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col gap-4">
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

        {actionError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
            会话操作失败：{actionError}
          </div>
        )}

        {/* 消息列表 */}
        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-4">
          {items.length === 0 && (
            <div className="py-16 text-center">
              {!activeId ? (
                <p className="text-sm text-neutral-400">点击左侧「新建会话」开始对话</p>
              ) : (
                <>
                  <p className="text-sm text-neutral-400">发一条消息开始对话，例如：</p>
                  <p className="mt-2 text-sm text-neutral-500">「GitHub trending 这周有什么好项目？」</p>
                  <p className="text-sm text-neutral-500">「用 tingguo-weekly 产出一期《听过》周刊」</p>
                </>
              )}
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
            placeholder={placeholder}
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
    </div>
  );
}
