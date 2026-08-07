import path from 'node:path';
import {
  ModelRuntime,
  DefaultResourceLoader,
  SessionManager,
  createAgentSession,
  loadSkillsFromDir,
  getAgentDir,
  type AgentSession,
  type AgentSessionEvent,
  type SessionEntry,
  type SessionMessageEntry,
} from '@earendil-works/pi-coding-agent';
import { REPO_ROOT, SESSION_DIR } from './repo-paths.js';
import { getEffectiveConfig } from './provider-config.js';

/**
 * pi Agent 会话运行时（单用户，多会话）。
 *
 * 复用 spike（`.pi/run-tingguo-weekly.mjs` + `spike-pi-sdk/verify-streaming.mjs`）的
 * session 封装模式：ModelRuntime(models 覆盖) + DefaultResourceLoader(.claude/skills 合并)
 * + SessionManager + createAgentSession。
 * 真实 pi SDK 会话（JSONL 落盘），禁止 mock。
 *
 * 多会话语义：按 conversationId 缓存独立 AgentRuntime（runtimes Map），每个会话持有独立
 * SessionManager（JSONL 互不干扰）；open 恢复历史对话、continueRecent 缺省（最近或新建）、
 * create 建新。sendPrompt / abort / 状态快照均可指定会话，缺省指向当前活跃会话。
 *
 * 模型与凭据（env > .pi/config.json > 代码默认值；禁止把第三方中转域名硬编码进仓库/文档）：
 *   ANTHROPIC_BASE_URL   anthropic 端点。未设置 → 回退官方语义 https://api.anthropic.com。
 *   ANTHROPIC_API_KEY    api key（SDK 发 x-api-key 头；优先注入）
 *   ANTHROPIC_AUTH_TOKEN bearer token（SDK 发 Authorization: Bearer 头；无 API_KEY 时由 SDK 原生兜底）
 *   PI_MODEL             模型 id（默认 claude-haiku-4-5；对自定义端点需确认其接受该 id）
 *   PI_THINKING          thinking 级别（默认 low，触发 thinking_delta 供前端渲染）
 *   PI_MODELS_PATH       models.json 路径（默认 .pi/models.json，仅 provider 覆盖，不再含端点）
 *   PI_SKILLS_DIR        skills 目录（默认 .claude/skills）
 *   PI_CONFIG_PATH       .pi/config.json 路径（默认仓库根 .pi/config.json；GET/PUT /api/config 读写）
 *
 * model id / thinking / baseUrl 的运行时落盘层为 .pi/config.json（优先级 env > 文件 > 默认值，
 * 见 provider-config.ts），每次 createRuntime / getSessionSnapshot 时重新解析。API key 绝不落盘，
 * 仅走 env（内存态 setRuntimeApiKey），env 缺失时 SDK DefaultAuthStorage 兜底读 auth.json；
 * 两者皆无 → createRuntime 显式抛错，绝不静默无凭据运行。
 */

/* ── 归一化事件协议（服务端 → WebSocket 客户端）── */

/** 归一化后的 agent 事件：精简字段，客户端直接消费。 */
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

/** 会话状态快照（连接/状态栏用）。 */
export interface AgentStateSnapshot {
  status: 'initializing' | 'idle' | 'streaming' | 'error';
  model: string;
  thinkingLevel: string;
  skills: string[];
  error?: string;
}

/** 工具执行结果 → 可读文本。result 形如 { content: [{ type, text }], details? }。 */
export function stringifyToolResult(result: unknown): string {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  const obj = result as Record<string, unknown>;
  if (Array.isArray(obj.content)) {
    const parts = obj.content
      .map((c) => {
        if (typeof c === 'string') return c;
        const co = c as Record<string, unknown>;
        if (typeof co.text === 'string') return co.text;
        if (typeof co.name === 'string') return `${co.name}: ${JSON.stringify(co.input ?? {})}`;
        try {
          return JSON.stringify(co);
        } catch {
          return String(co);
        }
      })
      .filter((p): p is string => Boolean(p));
    return parts.join('\n');
  }
  if (typeof obj.text === 'string') return obj.text;
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(result);
  }
}

/** 把 pi 原始会话事件归一化为精简 WebSocket 事件；不关心的类型返回 null。 */
export function normalizeAgentEvent(event: AgentSessionEvent): AgentWsEvent | null {
  switch (event.type) {
    case 'agent_start':
      return { kind: 'agent_start' };
    case 'agent_settled':
      return { kind: 'agent_settled' };
    case 'turn_start':
      return { kind: 'turn_start' };
    case 'turn_end':
      return { kind: 'turn_end' };
    case 'message_start':
      return { kind: 'message_start', role: event.message.role };
    case 'message_end':
      return { kind: 'message_end', role: event.message.role };
    case 'message_update': {
      const e = event.assistantMessageEvent;
      switch (e.type) {
        case 'text_delta':
          return { kind: 'delta', sub: 'text', delta: e.delta };
        case 'thinking_delta':
          return { kind: 'delta', sub: 'thinking', delta: e.delta };
        case 'toolcall_delta':
          return { kind: 'delta', sub: 'toolcall', delta: e.delta };
        case 'toolcall_end':
          return { kind: 'toolcall_end', id: e.toolCall.id, name: e.toolCall.name };
        default:
          return null; // text_start / text_end / thinking_start / … 前端由 delta 累积推导
      }
    }
    case 'tool_execution_start':
      return { kind: 'tool_start', id: event.toolCallId, name: event.toolName, args: event.args };
    case 'tool_execution_end':
      return {
        kind: 'tool_end',
        id: event.toolCallId,
        name: event.toolName,
        isError: event.isError,
        result: stringifyToolResult(event.result),
      };
    case 'queue_update':
      return { kind: 'queue_update', steering: [...event.steering], followUp: [...event.followUp] };
    default:
      return null; // agent_end / compaction / retry 等暂不消费
  }
}

/* ── 事件扇出（供 WebSocket 层订阅并转发）── */

type Listener<T> = (value: T) => void;

class Fanout<T> {
  private listeners = new Set<Listener<T>>();

  subscribe(cb: Listener<T>): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(value: T): void {
    for (const cb of [...this.listeners]) cb(value);
  }
}

/** 归一化 agent 事件（携带所属会话 id，供 WS 层按会话路由/过滤）。 */
export interface ConversationAgentEvent {
  conversationId: string;
  event: AgentWsEvent;
}

/** 会话状态快照（携带所属会话 id）。 */
export interface ConversationStateSnapshot {
  conversationId: string;
  state: AgentStateSnapshot;
}

/** 归一化 agent 事件流（携带 conversationId）。 */
export const agentEvents = new Fanout<ConversationAgentEvent>();
/** 会话状态快照（idle/streaming/error + 模型/skills 元信息，携带 conversationId）。 */
export const sessionStates = new Fanout<ConversationStateSnapshot>();
/** 会话元信息变化（自动命名完成后下发新标题，携带 conversationId）。 */
export interface ConversationMetadataUpdate {
  conversationId: string;
  name: string;
}
/** 会话元信息变化流（供 WS 层转发，客户端据此刷新会话列表）。 */
export const conversationUpdated = new Fanout<ConversationMetadataUpdate>();

/* ── 会话运行时（单用户，按 conversationId 缓存独立 AgentRuntime）── */

export interface AgentRuntime {
  /** 该运行时绑定的会话 id（会话 JSONL 的 header id）。 */
  readonly conversationId: string;
  readonly session: AgentSession;
  readonly modelId: string;
  readonly thinkingLevel: string;
  readonly skills: string[];
  readonly tools: string[];
  dispose(): void;
}

const MODELS_PATH = process.env.PI_MODELS_PATH ?? path.join(REPO_ROOT, '.pi', 'models.json');
const SKILLS_DIR = process.env.PI_SKILLS_DIR ?? path.join(REPO_ROOT, '.claude', 'skills');

/** anthropic api key（x-api-key 头）；未设置返回 undefined。 */
function resolveAnthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY?.trim() || undefined;
}

/** createAgentSession 的 thinkingLevel 参数类型（不直接依赖 pi-agent-core）。 */
type SessionThinkingLevel = NonNullable<Parameters<typeof createAgentSession>[0]>['thinkingLevel'];

/** 会话运行时缓存：conversationId → AgentRuntime（每个会话独立 pi AgentSession + ModelRuntime，JSONL 互不干扰）。 */
const runtimes = new Map<string, Promise<AgentRuntime>>();
/** 当前活跃会话 id（最后一次 sendPrompt 的会话；abort/snapshot 缺省目标）。 */
let activeConversationId: string | null = null;
/** 无任何历史会话时新建缺省会话的防并发重复创建守卫。 */
let defaultRuntimePromise: Promise<AgentRuntime> | undefined;

/**
 * 按 conversationId 打开目标 JSONL 会话（真实 pi SessionManager.open）；
 * 会话不存在抛错（不隐式新建）。
 */
async function openSessionManager(conversationId: string): Promise<SessionManager> {
  const sessions = await SessionManager.list(REPO_ROOT, SESSION_DIR); // 按 modified 倒序
  const info = sessions.find((s) => s.id === conversationId);
  if (!info) {
    throw new Error(`会话不存在: ${conversationId}`);
  }
  return SessionManager.open(info.path, SESSION_DIR);
}

/* ── 会话自动命名（agent_settled 后触发，单次轻量模型调用生成 ≤8 字标题）── */

/** 命名调用输出 token 上限（标题 ≤8 字，成本克制）。 */
const NAME_MAX_TOKENS = 48;
/** 命名摘要源单侧截断上限（首条用户消息 / 首条助手回复各取前 300 字）。 */
const NAME_SOURCE_MAX = 300;
/** 命名专用 system prompt：短、明确要求直接输出标题本身。 */
const NAME_SYSTEM_PROMPT =
  '你是会话标题生成器。根据对话内容用中文生成一个不超过 8 个字的会话短标题。' +
  '只输出标题本身，不要引号、冒号或任何解释。';

/** 标题清洗：去首尾引号/括号与空白、取第一行、去「标题：」前缀、截断到 ≤8 字；空结果返回 null。 */
export function sanitizeTitle(raw: string): string | null {
  const firstLine = raw.trim().split(/\n/)[0] ?? '';
  const cleaned = firstLine
    .replace(/^[\s"''「『【（(“”]+/, '')
    .replace(/[\s"''」』【】（）)“”]+$/, '')
    .replace(/^标题\s*[:：]\s*/, '')
    .trim();
  const title = Array.from(cleaned).slice(0, 8).join('').trim();
  return title.length >= 1 ? title : null;
}

/** 摘要源截断：超出上限补省略号（控制 prompt 长度）。 */
function truncateForName(text: string, max = NAME_SOURCE_MAX): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}

/** 消息 content → 纯文本（text 块 + thinking 块；toolCall 与命名主题无关，跳过）。 */
function extractNamingText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content as Array<Record<string, unknown>>) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    else if (block?.type === 'thinking' && typeof block.thinking === 'string') parts.push(block.thinking);
  }
  return parts.join('\n');
}

/** 命名摘要源：首条用户消息 + 首条助手回复（各自截断，控制 prompt 长度与成本）。 */
function extractNamingSource(entries: SessionEntry[]): string {
  let userText = '';
  let assistantText = '';
  for (const entry of entries) {
    if (entry.type !== 'message') continue;
    const msg = (entry as SessionMessageEntry).message as unknown as {
      role?: string;
      content?: unknown;
    };
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    const text = extractNamingText(msg.content).trim();
    if (!text) continue;
    if (msg.role === 'user') {
      if (!userText) userText = truncateForName(text);
    } else if (!assistantText) {
      assistantText = truncateForName(text);
    }
    if (userText && assistantText) break;
  }
  return [userText && `用户：${userText}`, assistantText && `助手：${assistantText}`].filter(Boolean).join('\n');
}

/**
 * 一次轻量模型调用生成 ≤8 字中文标题（复用会话运行时同款模型与凭据，不污染会话上下文）。
 * 失败 / 结果不可用返回 null，由调用方静默降级（保持首条消息标题）。
 */
async function generateConversationTitle(
  modelRuntime: ModelRuntime,
  model: NonNullable<AgentSession['model']>,
  source: string,
): Promise<string | null> {
  try {
    const result = await modelRuntime.completeSimple(
      model,
      {
        systemPrompt: NAME_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `${source}\n\n标题：`, timestamp: Date.now() }],
      },
      { maxTokens: NAME_MAX_TOKENS, reasoning: 'minimal' },
    );
    let text = '';
    for (const block of result.content) {
      if (block.type === 'text') text += block.text;
    }
    return sanitizeTitle(text);
  } catch {
    return null; // 命名失败静默降级（保持首条消息标题）
  }
}

/**
 * 会话自动命名（agent_settled 后触发）：会话无 name 时，用一次轻量模型调用
 * 生成 ≤8 字中文标题并写入 session_info，完成后扇出 conversationUpdated。
 *
 * 覆盖规则：落盘前用最新文件态复查 name，用户已重命名 / 已自动命名 → 跳过，绝不覆盖。
 * 任一步失败（无运行时 / 模型缺失 / LLM 调用失败 / 结果为空 / 会话消失）→ 返回 null，静默降级。
 * 成本：每个会话至多每轮一次轻量调用；命名成功后 name 非空，后续 settle 直接跳过。
 */
export async function autoNameConversation(conversationId: string): Promise<string | null> {
  // 运行时未缓存（会话从未运行过）→ 跳过。
  const pending = runtimes.get(conversationId);
  if (!pending) return null;
  let session: AgentSession;
  try {
    session = (await pending).session;
  } catch {
    return null;
  }
  const model = session.model;
  if (!model) return null;

  // 最新文件态已命名（用户重命名或已自动命名）→ 不再自动覆盖。
  let manager: SessionManager;
  try {
    manager = await openSessionManager(conversationId);
  } catch {
    return null; // 会话已删除等
  }
  if (manager.getSessionName()) return null;

  // 摘要源：首条用户消息 + 首条助手回复。
  const source = extractNamingSource(manager.getEntries());
  if (!source) return null;

  // 一次轻量模型调用（短 prompt、≤8 字、低 token）——失败静默降级。
  const title = await generateConversationTitle(session.modelRuntime, model, source);
  if (!title) return null;

  // 落盘前复查：模型调用期间用户可能已重命名 → 覆盖则放弃本次命名。
  try {
    const fresh = await openSessionManager(conversationId);
    if (fresh.getSessionName()) return null;
    fresh.appendSessionInfo(title);
  } catch {
    return null;
  }
  conversationUpdated.emit({ conversationId, name: title });
  return title;
}

async function createRuntime(targetConversationId?: string): Promise<{ runtime: AgentRuntime; conversationId: string }> {
  // 0. 生效配置：env > .pi/config.json > 代码默认值（见 provider-config.ts）。
  const cfg = await getEffectiveConfig();

  // 1. 模型运行时 —— 端点由 env ANTHROPIC_BASE_URL / .pi/config.json baseUrl 覆盖
  //    （.pi/models.json 不再硬编码端点）。用 registerProvider 扩展层覆盖内置 anthropic baseUrl：
  //    不写 models.json，避免把中转域名提交进仓库。
  const modelRuntime = await ModelRuntime.create({ modelsPath: MODELS_PATH });

  if (cfg.baseUrl) {
    modelRuntime.registerProvider(cfg.provider, { baseUrl: cfg.baseUrl });
  } else {
    console.warn('[agent] baseUrl 未设置（env ANTHROPIC_BASE_URL / .pi/config.json baseUrl），回退 anthropic 官方端点 https://api.anthropic.com');
  }

  // 2. 凭据显式注入（env 优先，内存态不落盘）。env 缺失时 SDK DefaultAuthStorage 兜底读 auth.json。
  const apiKey = resolveAnthropicApiKey();
  if (apiKey) {
    await modelRuntime.setRuntimeApiKey(cfg.provider, apiKey);
  }

  // 凭据校验：env + auth.json 均无 anthropic 凭据 → 显式报错，不静默运行。
  const auth = await modelRuntime.getAuth(cfg.provider);
  if (!auth) {
    throw new Error(
      '未找到 anthropic 凭据：请设置环境变量 ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN，' +
        '或写入 ' + path.join(getAgentDir(), 'auth.json') + '（chmod 600）',
    );
  }

  let model = modelRuntime.getModel(cfg.provider, cfg.modelId);
  if (!model) {
    const available = await modelRuntime.getAvailable();
    model = available.find((m) => m.provider === cfg.provider);
  }
  if (!model) {
    throw new Error(`未找到可用的 ${cfg.provider} 模型（modelId=${cfg.modelId}）`);
  }

  // 3. 资源加载器 —— 合并 .claude/skills 下 3 个 SKILL（tingguo-weekly 等），零格式改动。
  const fromClaude = loadSkillsFromDir({ dir: SKILLS_DIR, source: 'claude-skills' });
  const loader = new DefaultResourceLoader({
    cwd: REPO_ROOT,
    agentDir: getAgentDir(),
    skillsOverride: (base) => {
      const names = new Set(base.skills.map((s) => s.name));
      const merged = [...base.skills];
      for (const s of fromClaude.skills) {
        if (!names.has(s.name)) merged.push(s);
      }
      return { skills: merged, diagnostics: base.diagnostics };
    },
  });
  await loader.reload();

  // 4. 会话 —— 持久化 JSONL（.pi/sessions/）。
  //    目标 conversationId 明确时打开对应 JSONL（真实恢复历史对话）；缺省 continueRecent
  //    （无会话时新建，重启后恢复最近会话）。每个会话持有独立 SessionManager，互不干扰。
  const sessionManager = targetConversationId
    ? await openSessionManager(targetConversationId)
    : SessionManager.continueRecent(REPO_ROOT, SESSION_DIR);

  const { session } = await createAgentSession({
    cwd: REPO_ROOT,
    modelRuntime,
    model,
    thinkingLevel: cfg.thinkingLevel as SessionThinkingLevel,
    resourceLoader: loader,
    sessionManager,
  });

  const conversationId = session.sessionManager.getSessionId();
  const skills = loader.getSkills().skills.map((s) => s.name);
  const state: AgentStateSnapshot = {
    status: 'idle',
    model: model.id,
    thinkingLevel: cfg.thinkingLevel,
    skills,
  };

  // 5. 订阅事件 → 带 conversationId 归一化扇出 + 会话状态切换。
  session.subscribe((event) => {
    const normalized = normalizeAgentEvent(event);
    if (normalized) agentEvents.emit({ conversationId, event: normalized });
    if (event.type === 'agent_start') {
      sessionStates.emit({ conversationId, state: { ...state, status: 'streaming' } });
    } else if (event.type === 'agent_settled') {
      sessionStates.emit({ conversationId, state: { ...state, status: 'idle' } });
      // 自动命名：会话无 name 且一轮对话完成 → 单次轻量模型调用生成 ≤8 字标题。
      // 异步执行不阻塞事件循环；内部全失败静默降级（保持首条消息标题），cost 每轮至多一次。
      void autoNameConversation(conversationId).catch(() => {});
    }
  });

  // 运行时就绪：下发完整快照（模型 / skills）。
  sessionStates.emit({ conversationId, state });

  const runtime: AgentRuntime = {
    conversationId,
    session,
    modelId: model.id,
    thinkingLevel: cfg.thinkingLevel,
    skills,
    tools: session.getActiveToolNames(),
    dispose: () => session.dispose(),
  };
  return { runtime, conversationId };
}

/**
 * 解析缺省会话 id：会话目录中最近修改的会话（SessionManager.list 按 modified 倒序）。
 * 无任何历史会话返回 undefined（由调用方决定新建）。
 */
export async function resolveDefaultConversationId(): Promise<string | undefined> {
  const sessions = await SessionManager.list(REPO_ROOT, SESSION_DIR);
  return sessions[0]?.id;
}

/** 按 conversationId 取（或创建）运行时并缓存；创建失败清缓存，下次可重试。 */
function getCachedOrCreateRuntime(conversationId: string): Promise<AgentRuntime> {
  const cached = runtimes.get(conversationId);
  if (cached) return cached;
  const promise = createRuntime(conversationId).then(({ runtime, conversationId: resolved }) => {
    activeConversationId = resolved;
    return runtime;
  });
  promise.catch(() => {
    if (runtimes.get(conversationId) === promise) runtimes.delete(conversationId);
  });
  runtimes.set(conversationId, promise);
  return promise;
}

/** 无任何历史会话时新建缺省会话（幂等守卫，防并发重复创建）。 */
function getOrCreateDefaultRuntime(): Promise<AgentRuntime> {
  if (!defaultRuntimePromise) {
    defaultRuntimePromise = createRuntime(undefined).then(({ runtime, conversationId }) => {
      runtimes.set(conversationId, Promise.resolve(runtime));
      activeConversationId = conversationId;
      return runtime;
    });
    defaultRuntimePromise.catch(() => {
      defaultRuntimePromise = undefined;
    });
  }
  return defaultRuntimePromise;
}

/**
 * 获取（或创建）指定会话的运行时。
 * - conversationId 显式给定 → 打开该历史会话（不存在抛错）
 * - 缺省 → 最近会话（每次重新解析，跟随新建会话）；无任何历史会话 → 新建默认会话
 */
export function getAgentRuntime(conversationId?: string): Promise<AgentRuntime> {
  if (conversationId) return getCachedOrCreateRuntime(conversationId);
  return resolveDefaultConversationId().then((id) =>
    id ? getCachedOrCreateRuntime(id) : getOrCreateDefaultRuntime(),
  );
}

/** 发送一条用户消息到指定会话（缺省最近会话/新建）。流式期间自动 followUp 排队，空闲则直接运行。 */
export async function sendPrompt(text: string, conversationId?: string): Promise<void> {
  const runtime = await getAgentRuntime(conversationId);
  activeConversationId = runtime.conversationId;
  const opts = runtime.session.isStreaming ? { streamingBehavior: 'followUp' as const } : undefined;
  await runtime.session.prompt(text, opts);
}

/** 中断指定会话（缺省当前活跃会话）的 agent 运行（空闲时为空操作）。 */
export async function abortRun(conversationId?: string): Promise<void> {
  const id = conversationId ?? activeConversationId;
  if (!id) return;
  const runtime = await getAgentRuntime(id);
  if (runtime.session.isStreaming) {
    await runtime.session.abort();
  }
}

/**
 * 指定会话状态快照（缺省当前活跃会话；连接时下发，不触发运行时创建）。
 * 运行时未创建 → initializing（保持 agent.test.ts 无参行为）。
 */
export async function getSessionSnapshot(conversationId?: string): Promise<AgentStateSnapshot> {
  const cfg = await getEffectiveConfig();
  const id = conversationId ?? activeConversationId ?? undefined;
  const pending = id ? runtimes.get(id) : undefined;
  if (!pending) {
    return { status: 'initializing', model: cfg.modelId, thinkingLevel: cfg.thinkingLevel, skills: [] };
  }
  try {
    const runtime = await pending;
    return {
      status: runtime.session.isStreaming ? 'streaming' : 'idle',
      model: runtime.modelId,
      thinkingLevel: runtime.thinkingLevel,
      skills: runtime.skills,
    };
  } catch (err) {
    return {
      status: 'error',
      model: cfg.modelId,
      thinkingLevel: cfg.thinkingLevel,
      skills: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
