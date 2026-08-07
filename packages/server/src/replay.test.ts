import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { SessionEntry, SessionMessageEntry } from '@earendil-works/pi-coding-agent';

/**
 * 编辑/重新生成/重试的截断重放逻辑测试（确定性，不触发真实 pi 运行时/网络）。
 *
 * 验证（基于 T3a spike 结论）：
 * 1) findReplayUserEntry：user 目标 → 自身；assistant 目标 → 回退前置 user（分支点）；
 *    不存在 / 无可回退 user → 抛错。
 * 2) 分支截断语义：branch(分支点 parentId) + appendMessage（编辑文本 / 新 assistant）
 *    → 活动分支替换旧轮（getBranch / buildSessionContext 只含活动路径），被遗弃分支
 *    仍在 getEntries；重开 JSONL 后活动分支一致（leaf = 文件最后条目）。
 * 3) messages API：截断后 GET messages 只返回活动分支，且每条携带 SDK entry id。
 * 4) WS replay 校验错误路径：缺 conversationId / 缺 entryId → error 帧，不触发运行时。
 *
 * replayConversation 的真实重跑（navigateTree + prompt）需要模型凭据与网络，本环境
 * 无法 live 验收；此处只测其依赖的纯逻辑与协议校验层。navigateTree 对 user 消息的
 * newLeafId = targetEntry.parentId，测试用 SessionManager.branch(parentId) 等价模拟。
 *
 * SESSION_DIR（repo-paths.ts）是模块加载期常量，必须在 import server 链路前设置
 * PI_SESSION_DIR，故用顶层 await + 动态 import 让测试写入独立的临时目录。
 */
const sessionDir = await mkdtemp(path.join(tmpdir(), 'pi-replay-'));
process.env.PI_SESSION_DIR = sessionDir;

const { buildServer } = await import('./index.js');
const { findReplayUserEntry } = await import('./agent.js');
const { SessionManager } = await import('@earendil-works/pi-coding-agent');
const { REPO_ROOT } = await import('./repo-paths.js');

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 清空会话目录（测试按定义顺序串行执行，互不干扰）。 */
async function clearSessionDir(): Promise<void> {
  for (const f of await readdir(sessionDir)) {
    await rm(path.join(sessionDir, f), { recursive: true, force: true });
  }
}

interface MsgIds {
  user1: string;
  assistant1: string;
  user2: string;
  assistant2: string;
}

/** 用真实 SDK SessionManager 写入 user1→assistant1→user2→assistant2 四轮消息（assistant 触发 JSONL 落盘）。 */
function createFourMessageSession(): { manager: SessionManager; ids: MsgIds } {
  const manager = SessionManager.create(REPO_ROOT, sessionDir);
  const user1 = manager.appendMessage({ role: 'user', content: [{ type: 'text', text: '第一问' }] });
  const assistant1 = manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: '第一答' }] });
  const user2 = manager.appendMessage({ role: 'user', content: [{ type: 'text', text: '第二问' }] });
  const assistant2 = manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: '第二答' }] });
  return { manager, ids: { user1, assistant1, user2, assistant2 } };
}

/** 提取消息 content 中首个 text 块文本（空/缺省返回空串）。 */
function messageText(message: { content?: unknown }): string {
  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  for (const block of content as Array<Record<string, unknown>>) {
    if (block?.type === 'text' && typeof block.text === 'string') return block.text;
  }
  return '';
}

/** 会话条目 → 消息文本。 */
function entryText(entry: SessionEntry): string {
  if (entry.type !== 'message') return '';
  return messageText((entry as SessionMessageEntry).message);
}

/** 活动分支的消息文本列表（[root → leaf] 时间序）。 */
function branchTexts(manager: SessionManager): string[] {
  return manager.getBranch().map(entryText);
}

test('findReplayUserEntry：user 目标即自身；assistant 目标回退前置 user；不存在抛错', async () => {
  try {
    const { manager, ids } = createFourMessageSession();
    assert.equal(findReplayUserEntry(manager, ids.user2).id, ids.user2, 'user 目标应直接返回自身');
    assert.equal(findReplayUserEntry(manager, ids.assistant2).id, ids.user2, 'assistant 目标应回退到其前置 user');
    assert.equal(findReplayUserEntry(manager, ids.assistant1).id, ids.user1, '中间 assistant 目标应回退到前置 user');
    assert.throws(
      () => findReplayUserEntry(manager, 'nonexistent-entry'),
      /找不到可重放的用户消息/,
      '不存在的条目应抛错',
    );
  } finally {
    await clearSessionDir();
  }
});

test('分支截断语义：重放后活动分支替换旧轮，被遗弃分支保留在 getEntries，重开一致', async () => {
  try {
    const { manager, ids } = createFourMessageSession();
    const user2 = manager.getEntry(ids.user2);
    assert.ok(user2, 'user2 条目应存在');
    // navigateTree(user2) 的 newLeafId = user2.parentId（= assistant1）→ 用 branch() 等价模拟。
    manager.branch(user2.parentId!);
    const editedUser = manager.appendMessage({ role: 'user', content: [{ type: 'text', text: '第二问（编辑后）' }] });
    const newAssistant = manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: '第二答（新）' }] });

    // 内存态：活动分支为 [user1, assistant1, 编辑后 user, 新 assistant]，旧轮被截断。
    assert.deepEqual(
      branchTexts(manager),
      ['第一问', '第一答', '第二问（编辑后）', '第二答（新）'],
      '活动分支应替换旧轮（重放后该轮后续消息被截断）',
    );
    assert.deepEqual(
      manager.getBranch().map((e) => e.id),
      [ids.user1, ids.assistant1, editedUser, newAssistant],
      '活动分支 id 链应沿 parentId 到新 leaf',
    );
    assert.equal(manager.getEntries().length, 6, 'getEntries 保留全部条目（含被遗弃分支 user2/assistant2）');

    // LLM 上下文同样只含活动路径。
    const ctx = manager.buildSessionContext();
    assert.equal(ctx.messages.length, 4, '上下文只含 4 条活动消息');
    assert.equal(messageText(ctx.messages[2]), '第二问（编辑后）', '第 3 条应为编辑后的 user 文本');

    // 真实持久化路径：重开 JSONL 后 leaf = 文件最后条目，活动分支与内存态一致。
    const reopened = SessionManager.open(manager.getSessionFile()!, sessionDir);
    assert.deepEqual(
      branchTexts(reopened),
      ['第一问', '第一答', '第二问（编辑后）', '第二答（新）'],
      '重开后活动分支与内存态一致',
    );
  } finally {
    await clearSessionDir();
  }
});

test('messages API：重放截断后只返回活动分支，且每条携带 SDK entry id', async () => {
  try {
    const { manager, ids } = createFourMessageSession();
    const sessionId = manager.getSessionId();

    // 模拟重放：leaf 移到 user2.parentId，追加编辑后的 user + 新 assistant（同 navigateTree+prompt 语义）。
    manager.branch(manager.getEntry(ids.user2)!.parentId!);
    manager.appendMessage({ role: 'user', content: [{ type: 'text', text: '第二问（编辑后）' }] });
    manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: '第二答（新）' }] });

    const app = (await buildServer()) as FastifyInstance;
    try {
      await app.ready();
      const res = await app.inject({ method: 'GET', url: `/api/conversations/${sessionId}/messages` });
      assert.equal(res.statusCode, 200);
      const { messages } = res.json() as { messages: { id: string; role: string; text: string }[] };
      assert.equal(messages.length, 4, '截断后 messages 应为 4 条（旧轮 user2/assistant2 不再显示）');
      assert.deepEqual(
        messages.map((m) => [m.role, m.text]),
        [
          ['user', '第一问'],
          ['assistant', '第一答'],
          ['user', '第二问（编辑后）'],
          ['assistant', '第二答（新）'],
        ],
        'messages 应按活动分支时间序返回编辑后的内容',
      );
      for (const m of messages) {
        assert.ok(typeof m.id === 'string' && m.id.length > 0, '每条消息应携带 SDK entry id（重放目标）');
      }
      const returnedIds = new Set(messages.map((m) => m.id));
      assert.ok(!returnedIds.has(ids.user2), '被遗弃分支的旧 user 消息不应出现在 messages');
      assert.ok(!returnedIds.has(ids.assistant2), '被遗弃分支的旧 assistant 消息不应出现在 messages');
    } finally {
      await app.close();
    }
  } finally {
    await clearSessionDir();
  }
});

/** WS 服务端推送信封（ready / conversation / session / agent_event / error …）。 */
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

test('WS replay 校验：缺 conversationId / 缺 entryId → 错误帧，不触发运行时', async () => {
  try {
    await createFourMessageSession(); // 保证缺省解析有真实会话（快照 initializing，不触发网络）
    const app = (await buildServer()) as AppWithInjectWS;
    try {
      await app.ready();

      // 缺 conversationId：错误帧不带会话信封（客户端按全局错误处理）。
      const { ws, envelopes } = await connectWS(app, '/ws');
      try {
        // 等 session 帧：ws.ts 的 message 监听器在 getSessionSnapshot 之后才挂载，
        // 过早发送 replay 会因监听器未挂载而丢失（injectWS 下无 socket-level 缓冲语义保证）。
        await waitForEnvelope(envelopes, 'session');
        ws.send(JSON.stringify({ type: 'replay', payload: { entryId: 'some-entry-id' } }));
        const err = await waitForEnvelope(envelopes, 'error');
        assert.equal(err.payload.message, 'replay requires conversationId');
        assert.equal(err.conversationId, undefined, '缺 conversationId 的错误帧不应带会话信封');
      } finally {
        ws.terminate();
      }

      // 缺 entryId：错误帧带目标会话 id（客户端据此过滤，避免错误串到其他会话）。
      const { ws: ws2, envelopes: envelopes2 } = await connectWS(app, '/ws');
      try {
        await waitForEnvelope(envelopes2, 'session');
        ws2.send(JSON.stringify({ type: 'replay', payload: { conversationId: 'some-conversation-id' } }));
        const err = await waitForEnvelope(envelopes2, 'error');
        assert.equal(err.payload.message, 'replay requires entryId');
        assert.equal(err.conversationId, 'some-conversation-id', '缺 entryId 的错误帧应带目标会话 id');
      } finally {
        ws2.terminate();
      }
    } finally {
      await app.close();
    }
  } finally {
    await clearSessionDir();
  }
});
