import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';

/**
 * WS 会话路由 / 缺省会话解析测试（确定性，不触发真实 pi 运行时）。
 *
 * 验证：
 * 1) resolveDefaultConversationId：无会话 → undefined；多会话 → 最近修改的会话 id
 * 2) WS 握手 /ws?conversation=<id> → conversation 消息携带该 id，defaulted=false
 * 3) WS 握手无参数 + 有会话 → conversation 消息为最近会话 id，defaulted=true
 * 4) WS 握手无参数 + 无会话 → conversation 消息为 null（首个消息新建），defaulted=true
 *
 * 沙箱禁网络，真实 pi 会话续聊无法在本环境 live 验收；本测试只触达会话解析与
 * 握手协议层——快照在运行时未创建时返回 initializing（不创建 AgentRuntime，
 * 避免触发模型 warm-up 的网络调用）。会话 JSONL 用真实 SDK SessionManager 写入。
 *
 * SESSION_DIR（repo-paths.ts）是模块加载期常量，必须在 import server 链路前设置
 * PI_SESSION_DIR，故这里用顶层 await + 动态 import 让测试写入独立的临时目录。
 */
const sessionDir = await mkdtemp(path.join(tmpdir(), 'pi-ws-sessions-'));
process.env.PI_SESSION_DIR = sessionDir;

const { buildServer } = await import('./index.js');
const { resolveDefaultConversationId } = await import('./agent.js');
const { SessionManager } = await import('@earendil-works/pi-coding-agent');
const { REPO_ROOT } = await import('./repo-paths.js');

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 清空会话目录（单文件测试按定义顺序串行执行，互不干扰）。 */
async function clearSessionDir(): Promise<void> {
  for (const f of await readdir(sessionDir)) {
    await rm(path.join(sessionDir, f), { recursive: true, force: true });
  }
}

/**
 * 用真实 SDK SessionManager 创建会话并写入 user+assistant 消息。
 * SDK 在首个 assistant 消息到达时才落盘 JSONL（此前 user 条目只在内存缓冲），
 * 故必须追加 assistant 消息才能让会话出现在 SessionManager.list 中。
 */
async function createSessionWithMessage(text: string): Promise<string> {
  const manager = SessionManager.create(REPO_ROOT, sessionDir);
  manager.appendMessage({ role: 'user', content: [{ type: 'text', text }] });
  manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'ack' }] });
  return manager.getSessionId();
}

/** WS 服务端推送信封（ready / conversation / session / agent_event …）。 */
interface WsEnvelope {
  type: string;
  payload: Record<string, unknown>;
  conversationId?: string;
}

interface AppWithInjectWS {
  ready(): Promise<void>;
  close(): Promise<void>;
  injectWS(
    url: string,
    upgradeContext?: Record<string, unknown>,
    options?: { onInit?: (ws: WebSocket) => void },
  ): Promise<WebSocket>;
}

/** 建立注入 WS 连接；onInit 在连接建立前注册消息监听，确保不丢服务端首个帧。 */
async function connectWS(app: AppWithInjectWS, url: string): Promise<{ ws: WebSocket; envelopes: WsEnvelope[] }> {
  const envelopes: WsEnvelope[] = [];
  const ws = await app.injectWS(
    url,
    {},
    {
      onInit: (sock) => {
        sock.on('message', (data: Buffer) => envelopes.push(JSON.parse(data.toString()) as WsEnvelope));
      },
    },
  );
  return { ws, envelopes };
}

/** 轮询等待指定类型信封出现（超时报错）。 */
async function waitForEnvelope(envelopes: WsEnvelope[], type: string, timeoutMs = 2000): Promise<WsEnvelope> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const found = envelopes.find((e) => e.type === type);
    if (found) return found;
    if (Date.now() > deadline) throw new Error(`等待 ${type} 消息超时（已收：${envelopes.map((e) => e.type).join(', ')}）`);
    await delay(10);
  }
}

test('resolveDefaultConversationId：无会话 → undefined；多会话 → 最近修改的会话 id', async () => {
  try {
    assert.equal(await resolveDefaultConversationId(), undefined, '空会话目录应返回 undefined');

    const olderId = await createSessionWithMessage('older session');
    await delay(15); // 保证两次 appendMessage 的 entry timestamp 严格递增（ms 精度）
    const newerId = await createSessionWithMessage('newer session');
    assert.notEqual(olderId, newerId, '两次创建应生成不同会话 id');

    const resolved = await resolveDefaultConversationId();
    assert.equal(resolved, newerId, '应返回最近修改（后创建）的会话 id');

    // 删除最近会话后，缺省解析回退到较旧会话
    const files = (await readdir(sessionDir)).filter((f) => f.endsWith('.jsonl') && f.includes(newerId));
    assert.equal(files.length, 1, '应恰好找到一个较新会话文件');
    await rm(path.join(sessionDir, files[0]), { force: true });
    assert.equal(await resolveDefaultConversationId(), olderId, '删除最近会话后应回退到下一最近');
  } finally {
    await clearSessionDir();
  }
});

test('WS 握手 ?conversation=<id>：conversation 消息携带该 id，快照路由到该会话', async () => {
  try {
    const id = await createSessionWithMessage('explicit target');
    const app = (await buildServer()) as AppWithInjectWS;
    try {
      await app.ready();
      const { ws, envelopes } = await connectWS(app, `/ws?conversation=${id}`);
      try {
        const conv = await waitForEnvelope(envelopes, 'conversation');
        assert.equal(conv.payload.conversationId, id, '应回显查询参数指定的会话 id');
        assert.equal(conv.payload.defaulted, false, '显式指定会话 → defaulted=false');

        const session = await waitForEnvelope(envelopes, 'session');
        assert.equal(session.conversationId, id, '会话快照应携带目标 conversationId');
        assert.equal(session.payload.status, 'initializing', '运行时未创建 → initializing（不触发网络）');
      } finally {
        ws.terminate();
      }
    } finally {
      await app.close();
    }
  } finally {
    await clearSessionDir();
  }
});

test('WS 握手缺省：有历史会话时 conversation 为最近会话，defaulted=true', async () => {
  try {
    await createSessionWithMessage('older');
    await delay(15);
    const newerId = await createSessionWithMessage('newer');

    const app = (await buildServer()) as AppWithInjectWS;
    try {
      await app.ready();
      const { ws, envelopes } = await connectWS(app, '/ws');
      try {
        const conv = await waitForEnvelope(envelopes, 'conversation');
        assert.equal(conv.payload.conversationId, newerId, '缺省应解析到最近修改的会话');
        assert.equal(conv.payload.defaulted, true, '未显式指定 → defaulted=true');

        const session = await waitForEnvelope(envelopes, 'session');
        assert.equal(session.conversationId, newerId, '快照应指向缺省会话');
      } finally {
        ws.terminate();
      }
    } finally {
      await app.close();
    }
  } finally {
    await clearSessionDir();
  }
});

test('WS 握手缺省：无任何会话时 conversation 为 null（首个消息新建）', async () => {
  try {
    const app = (await buildServer()) as AppWithInjectWS;
    try {
      await app.ready();
      const { ws, envelopes } = await connectWS(app, '/ws');
      try {
        const conv = await waitForEnvelope(envelopes, 'conversation');
        assert.equal(conv.payload.conversationId, null, '无历史会话 → conversationId null（首个消息新建）');
        assert.equal(conv.payload.defaulted, true);
      } finally {
        ws.terminate();
      }
    } finally {
      await app.close();
    }
  } finally {
    await clearSessionDir();
  }
});

test('chat 空文本错误帧携带 conversationId（P2-8），客户端可按会话过滤', async () => {
  try {
    const id = await createSessionWithMessage('empty-text target');
    const app = (await buildServer()) as AppWithInjectWS;
    try {
      await app.ready();
      const { ws, envelopes } = await connectWS(app, `/ws?conversation=${id}`);
      try {
        await waitForEnvelope(envelopes, 'conversation');
        // 等 session 帧：ws.ts 的 message 监听器在 getSessionSnapshot 之后才挂载，
        // 过早发送 chat 会因监听器未挂载而丢失（injectWS 下无 socket-level 缓冲语义保证）。
        await waitForEnvelope(envelopes, 'session');
        // 空文本 chat → error 帧应带上目标会话 id，供客户端区分错误归属
        ws.send(JSON.stringify({ type: 'chat', payload: { text: '   ', conversationId: id } }));
        const err = await waitForEnvelope(envelopes, 'error');
        assert.equal(err.payload.message, 'empty chat text', '应报空文本错误');
        assert.equal(err.conversationId, id, '错误帧应携带目标 conversationId');
      } finally {
        ws.terminate();
      }
    } finally {
      await app.close();
    }
  } finally {
    await clearSessionDir();
  }
});
