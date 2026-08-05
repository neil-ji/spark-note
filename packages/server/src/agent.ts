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
} from '@earendil-works/pi-coding-agent';
import { REPO_ROOT } from './repo-paths.js';

/**
 * pi Agent 会话运行时（单用户）。
 *
 * 复用 spike（`.pi/run-tingguo-weekly.mjs` + `spike-pi-sdk/verify-streaming.mjs`）的
 * session 封装模式：ModelRuntime(models 覆盖) + DefaultResourceLoader(.claude/skills 合并)
 * + SessionManager.inMemory() + createAgentSession。真实 pi SDK 会话，禁止 mock。
 *
 * 环境变量（均有默认值）：
 *   PI_MODEL         模型 id（默认 claude-haiku-4-5，走本机 gateway）
 *   PI_THINKING      thinking 级别（默认 low，触发 thinking_delta 供前端渲染）
 *   PI_MODELS_PATH   models.json 路径（默认 .pi/models.json，baseUrl → 本机 gateway）
 *   PI_SKILLS_DIR    skills 目录（默认 .claude/skills）
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

/** 归一化 agent 事件流。 */
export const agentEvents = new Fanout<AgentWsEvent>();
/** 会话状态快照（idle/streaming/error + 模型/skills 元信息）。 */
export const sessionStates = new Fanout<AgentStateSnapshot>();

/* ── AgentRuntime 单例（单用户，懒创建 + 失败可重试）── */

export interface AgentRuntime {
  readonly session: AgentSession;
  readonly modelId: string;
  readonly thinkingLevel: string;
  readonly skills: string[];
  readonly tools: string[];
  dispose(): void;
}

const MODEL_ID = process.env.PI_MODEL ?? 'claude-haiku-4-5';
const THINKING = process.env.PI_THINKING ?? 'low';
const MODELS_PATH = process.env.PI_MODELS_PATH ?? path.join(REPO_ROOT, '.pi', 'models.json');
const SKILLS_DIR = process.env.PI_SKILLS_DIR ?? path.join(REPO_ROOT, '.claude', 'skills');

/** createAgentSession 的 thinkingLevel 参数类型（不直接依赖 pi-agent-core）。 */
type SessionThinkingLevel = NonNullable<Parameters<typeof createAgentSession>[0]>['thinkingLevel'];

let runtimePromise: Promise<AgentRuntime> | undefined;

async function createRuntime(): Promise<AgentRuntime> {
  // 1. 模型运行时 —— anthropic baseUrl → 本机 gateway（.pi/models.json 覆盖）。
  const modelRuntime = await ModelRuntime.create({ modelsPath: MODELS_PATH });

  let model = modelRuntime.getModel('anthropic', MODEL_ID);
  if (!model) {
    const available = await modelRuntime.getAvailable();
    model = available.find((m) => m.provider === 'anthropic');
  }
  if (!model) {
    throw new Error(`未找到可用的 anthropic 模型（PI_MODEL=${MODEL_ID}）`);
  }

  // 2. 资源加载器 —— 合并 .claude/skills 下 3 个 SKILL（tingguo-weekly 等），零格式改动。
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

  // 3. 会话 —— 内存会话（多轮对话在服务生命周期内保持；持久化 JSONL 为后续增强）。
  const { session } = await createAgentSession({
    cwd: REPO_ROOT,
    modelRuntime,
    model,
    thinkingLevel: THINKING as SessionThinkingLevel,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
  });

  const skills = loader.getSkills().skills.map((s) => s.name);
  const state: AgentStateSnapshot = {
    status: 'idle',
    model: model.id,
    thinkingLevel: THINKING,
    skills,
  };

  // 4. 订阅事件 → 归一化扇出 + 会话状态切换。
  session.subscribe((event) => {
    const normalized = normalizeAgentEvent(event);
    if (normalized) agentEvents.emit(normalized);
    if (event.type === 'agent_start') {
      sessionStates.emit({ ...state, status: 'streaming' });
    } else if (event.type === 'agent_settled') {
      sessionStates.emit({ ...state, status: 'idle' });
    }
  });

  // 运行时就绪：下发完整快照（模型 / skills）。
  sessionStates.emit(state);

  return {
    session,
    modelId: model.id,
    thinkingLevel: THINKING,
    skills,
    tools: session.getActiveToolNames(),
    dispose: () => session.dispose(),
  };
}

/** 获取（或创建）AgentRuntime 单例；创建失败时清空缓存，下次调用可重试。 */
export function getAgentRuntime(): Promise<AgentRuntime> {
  if (!runtimePromise) {
    runtimePromise = createRuntime().catch((err: unknown) => {
      runtimePromise = undefined;
      throw err;
    });
  }
  return runtimePromise;
}

/** 发送一条用户消息。流式期间自动 followUp 排队，空闲则直接运行。 */
export async function sendPrompt(text: string): Promise<void> {
  const runtime = await getAgentRuntime();
  const opts = runtime.session.isStreaming ? { streamingBehavior: 'followUp' as const } : undefined;
  await runtime.session.prompt(text, opts);
}

/** 中断当前 agent 运行（空闲时为空操作）。 */
export async function abortRun(): Promise<void> {
  const runtime = await getAgentRuntime();
  if (runtime.session.isStreaming) {
    await runtime.session.abort();
  }
}

/** 当前会话状态快照（连接时下发；不触发运行时创建）。 */
export async function getSessionSnapshot(): Promise<AgentStateSnapshot> {
  const pending = runtimePromise;
  if (!pending) {
    return { status: 'initializing', model: MODEL_ID, thinkingLevel: THINKING, skills: [] };
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
      model: MODEL_ID,
      thinkingLevel: THINKING,
      skills: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
