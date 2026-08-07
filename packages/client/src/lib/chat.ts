/**
 * 对话状态模型与 reducer。
 *
 * 服务端把 pi AgentSession 事件归一化为 AgentWsEvent 经 WebSocket 推送（见
 * packages/server/src/agent.ts 的 AgentWsEvent，两边字段一一对应），这里将其折叠成
 * 便于渲染的对话列表：用户消息 / 助手消息（流式文本 + 思考 + 工具调用卡片）。
 */

/* ---- 与后端 agent.ts 对应的 WebSocket 事件类型 ---- */

export type AgentWsEvent =
  | { kind: 'agent_start' }
  | { kind: 'agent_settled' }
  | { kind: 'agent_error'; message: string }
  | { kind: 'turn_start' }
  | { kind: 'turn_end' }
  | { kind: 'message_start'; role: string }
  | { kind: 'message_end'; role: string }
  | { kind: 'delta'; sub: 'text' | 'thinking' | 'toolcall'; delta: string }
  | { kind: 'toolcall_end'; id: string; name: string }
  | { kind: 'tool_start'; id: string; name: string; args: unknown }
  | { kind: 'tool_end'; id: string; name: string; isError: boolean; result: string }
  | { kind: 'queue_update'; steering: string[]; followUp: string[] };

export interface AgentStateSnapshot {
  status: 'initializing' | 'idle' | 'streaming' | 'error';
  model: string;
  thinkingLevel: string;
  skills: string[];
  error?: string;
}

/* ---- 对话渲染模型 ---- */

export interface ToolCallItem {
  id: string;
  name: string;
  /** 参数展示文本（工具调用结束后的完整参数）。 */
  args: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

export interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  thinking: string;
  tools: ToolCallItem[];
  status: 'streaming' | 'done' | 'error';
  error?: string;
}

export interface ChatState {
  /** 当前会话 id（null = 尚未切换 / 无会话）；reset/history 据此识别历史消息归属，防串会话。 */
  conversationId: string | null;
  items: ChatItem[];
  /** 当前正在流式构建的助手消息下标；无则 null。 */
  currentIdx: number | null;
  /** 正在流式构建的工具调用参数（toolcall_delta 累积）。 */
  pendingToolArgs: string;
  /** 会话状态（顶部状态栏用）。 */
  status: 'initializing' | 'idle' | 'streaming' | 'error';
  model: string;
  thinkingLevel: string;
  skills: string[];
  /** 排队中的 followUp 消息文本。 */
  queued: string[];
  error?: string;
}

export const initialChatState: ChatState = {
  conversationId: null,
  items: [],
  currentIdx: null,
  pendingToolArgs: '',
  status: 'initializing',
  model: '',
  thinkingLevel: '',
  skills: [],
  queued: [],
};

export type ChatAction =
  | { type: 'send'; text: string }
  | { type: 'snapshot'; snapshot: AgentStateSnapshot }
  | { type: 'event'; event: AgentWsEvent }
  | { type: 'reset'; conversationId: string | null }
  | { type: 'history'; conversationId: string | null; messages: { role: string; text: string }[] };

function newId(): string {
  return crypto.randomUUID();
}

/** 工具参数 → 展示文本：合法的 JSON 美化，否则原样。 */
function formatArgs(raw: string | undefined): string {
  const text = (raw ?? '').trim();
  if (!text) return '';
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function itemOf(state: ChatState, idx: number | null): ChatItem | null {
  if (idx == null) return null;
  return state.items[idx] ?? null;
}

function withItem(state: ChatState, idx: number, patch: Partial<ChatItem>): ChatState {
  const items = state.items.slice();
  items[idx] = { ...items[idx], ...patch };
  return { ...state, items };
}

function toolIndexOf(state: ChatState, toolId: string): number {
  const item = itemOf(state, state.currentIdx);
  if (!item) return -1;
  return item.tools.findIndex((t) => t.id === toolId);
}

function patchTool(state: ChatState, toolId: string, patch: Partial<ToolCallItem>): ChatState {
  const idx = state.currentIdx;
  const item = itemOf(state, idx);
  if (!item || idx == null) return state;
  const tools = item.tools.map((t) => (t.id === toolId ? { ...t, ...patch } : t));
  return withItem(state, idx, { tools });
}

function applyEvent(state: ChatState, e: AgentWsEvent): ChatState {
  switch (e.kind) {
    case 'agent_start':
      return { ...state, status: 'streaming' };

    case 'agent_settled':
      // 收尾：任何仍标着 streaming 的助手消息标记完成（abort 场景会有残留）。
      return {
        ...state,
        status: 'idle',
        items: state.items.map((it) => (it.status === 'streaming' ? { ...it, status: 'done' as const } : it)),
        currentIdx: null,
      };

    case 'agent_error':
      return { ...state, status: 'error', error: e.message };

    case 'message_start':
      if (e.role === 'assistant') {
        const item: ChatItem = { id: newId(), role: 'assistant', text: '', thinking: '', tools: [], status: 'streaming' };
        return { ...state, items: [...state.items, item], currentIdx: state.items.length, pendingToolArgs: '' };
      }
      return state;

    case 'message_end':
      // P2-5：收尾同时清掉 currentIdx，避免迟到的 message_end 命中已换会话/已完成的消息。
      if (e.role === 'assistant' && state.currentIdx != null) {
        return { ...withItem(state, state.currentIdx, { status: 'done' }), currentIdx: null };
      }
      return state;

    case 'delta': {
      const idx = state.currentIdx;
      if (idx == null) return state;
      if (e.sub === 'text') return withItem(state, idx, { text: state.items[idx].text + e.delta });
      if (e.sub === 'thinking') return withItem(state, idx, { thinking: state.items[idx].thinking + e.delta });
      return { ...state, pendingToolArgs: state.pendingToolArgs + e.delta };
    }

    case 'toolcall_end': {
      const idx = state.currentIdx;
      const item = itemOf(state, idx);
      if (!item || idx == null) return state;
      const tool: ToolCallItem = { id: e.id, name: e.name, args: formatArgs(state.pendingToolArgs), status: 'running' };
      return { ...withItem(state, idx, { tools: [...item.tools, tool] }), pendingToolArgs: '' };
    }

    case 'tool_start': {
      const toolId = e.id;
      const args = formatArgs(typeof e.args === 'string' ? e.args : JSON.stringify(e.args ?? ''));
      if (toolIndexOf(state, toolId) >= 0) {
        return patchTool(state, toolId, { name: e.name, args, status: 'running' });
      }
      // 没有 toolcall_end 就执行（罕见）：直接建卡片。
      const idx = state.currentIdx;
      const item = itemOf(state, idx);
      if (!item || idx == null) return state;
      const tool: ToolCallItem = { id: toolId, name: e.name, args, status: 'running' };
      return withItem(state, idx, { tools: [...item.tools, tool] });
    }

    case 'tool_end':
      if (toolIndexOf(state, e.id) >= 0) {
        return patchTool(state, e.id, { status: e.isError ? 'error' : 'done', result: e.result });
      }
      return state;

    case 'queue_update':
      return { ...state, queued: e.followUp };

    default:
      return state;
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'send': {
      const user: ChatItem = { id: newId(), role: 'user', text: action.text, thinking: '', tools: [], status: 'done' };
      return { ...state, items: [...state.items, user] };
    }
    case 'snapshot':
      return {
        ...state,
        status: action.snapshot.status,
        model: action.snapshot.model,
        thinkingLevel: action.snapshot.thinkingLevel,
        skills: action.snapshot.skills,
        error: action.snapshot.error,
      };
    case 'event':
      return applyEvent(state, action.event);
    case 'reset':
      // 切换会话：清空为初始态并记下目标会话 id（历史消息随后由 history 填充）。
      return { ...initialChatState, conversationId: action.conversationId ?? null };
    case 'history': {
      // P2-4：仅当历史消息属于当前会话时才应用——迟到 / 串会话的 history 一律丢弃
      // （此前以 items 非空为条件，切换会话加载历史会覆盖刚发送的消息，造成竞态）。
      if (state.conversationId !== action.conversationId) return state;
      const items: ChatItem[] = action.messages.map((m) => ({
        id: newId(),
        role: m.role === 'assistant' ? 'assistant' : 'user',
        text: m.text,
        thinking: '',
        tools: [],
        status: 'done' as const,
      }));
      return { ...state, items, currentIdx: null, pendingToolArgs: '', queued: [] };
    }
    default:
      return state;
  }
}
