import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * 会话管理 API 集成测试（inject 风格，真实 pi SessionManager JSONL 持久化，禁止 mock）。
 *
 * SESSION_DIR（repo-paths.ts）是模块加载期常量，必须在 import server 链路前设置
 * PI_SESSION_DIR，故这里用顶层 await + 动态 import 让测试写入独立的临时目录。
 */
const sessionDir = await mkdtemp(path.join(tmpdir(), 'pi-sessions-'));
process.env.PI_SESSION_DIR = sessionDir;

const { buildServer } = await import('../index.js');
const { SessionManager } = await import('@earendil-works/pi-coding-agent');

/** 在会话目录中按 id 找到 JSONL 文件路径（list API 不暴露 path，测试直接读目录）。 */
async function sessionFilePath(id: string): Promise<string> {
  const files = (await readdir(sessionDir)).filter((f) => f.endsWith('.jsonl') && f.includes(id));
  assert.equal(files.length, 1, `应恰好找到一个会话文件（id=${id}）`);
  return path.join(sessionDir, files[0]);
}

test('conversations API: POST/GET/PATCH/DELETE 全流程 + 错误路径', async () => {
  try {
    const app = await buildServer();

    // 初始为空
    let res = await app.inject({ method: 'GET', url: '/api/conversations' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().conversations, []);

    // POST 新建两个会话 → 201 + id
    res = await app.inject({ method: 'POST', url: '/api/conversations' });
    assert.equal(res.statusCode, 201);
    const id1 = res.json().id;
    assert.ok(typeof id1 === 'string' && id1.length > 0, '应返回非空会话 id');

    res = await app.inject({ method: 'POST', url: '/api/conversations' });
    assert.equal(res.statusCode, 201);
    const id2 = res.json().id;
    assert.notEqual(id1, id2, '两次 POST 应生成不同会话 id');

    // 列表字段齐全，空会话语义正确
    res = await app.inject({ method: 'GET', url: '/api/conversations' });
    const list = res.json().conversations;
    assert.equal(list.length, 2);
    const ids = list.map((c: { id: string }) => c.id);
    assert.ok(ids.includes(id1) && ids.includes(id2));
    for (const c of list) {
      for (const key of ['id', 'name', 'created', 'modified', 'messageCount', 'preview']) {
        assert.ok(key in c, `列表项应包含字段 ${key}`);
      }
      assert.equal(c.messageCount, 0, '空会话 messageCount 应为 0');
      assert.equal(c.name, '', '未命名会话 name 应为空串');
      assert.equal(c.preview, '', '空会话 preview 应为空串');
      assert.ok(!Number.isNaN(Date.parse(c.created)), 'created 应为合法时间');
      assert.ok(!Number.isNaN(Date.parse(c.modified)), 'modified 应为合法时间');
    }

    // PATCH 重命名 → 列表反映新名
    res = await app.inject({
      method: 'PATCH',
      url: `/api/conversations/${id1}`,
      headers: { 'content-type': 'application/json' },
      payload: { name: '会话A' },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().name, '会话A');
    res = await app.inject({ method: 'GET', url: '/api/conversations' });
    const renamed = res.json().conversations.find((c: { id: string }) => c.id === id1);
    assert.equal(renamed.name, '会话A');

    // 空 name → 400
    res = await app.inject({
      method: 'PATCH',
      url: `/api/conversations/${id1}`,
      headers: { 'content-type': 'application/json' },
      payload: { name: '   ' },
    });
    assert.equal(res.statusCode, 400);

    // 不存在的 id → 404（PATCH / GET messages / DELETE）
    for (const method of ['PATCH', 'DELETE'] as const) {
      const r = await app.inject({
        method,
        url: '/api/conversations/nonexistent-id',
        headers: { 'content-type': 'application/json' },
        payload: { name: 'x' },
      });
      assert.equal(r.statusCode, 404, `${method} 不存在会话应 404`);
    }
    res = await app.inject({ method: 'GET', url: '/api/conversations/nonexistent-id/messages' });
    assert.equal(res.statusCode, 404);

    // 空会话 GET messages → 空消息列表
    res = await app.inject({ method: 'GET', url: `/api/conversations/${id2}/messages` });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().id, id2);
    assert.deepEqual(res.json().messages, []);

    // DELETE id2 → 列表只剩 id1
    res = await app.inject({ method: 'DELETE', url: `/api/conversations/${id2}` });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().deleted, true);
    res = await app.inject({ method: 'GET', url: '/api/conversations' });
    assert.equal(res.json().conversations.length, 1);

    await app.close();
  } finally {
    await rm(sessionDir, { recursive: true, force: true });
  }
});

test('conversations API: 消息落盘，列表/消息读取反映，并在"重启"后恢复（持久化）', async () => {
  try {
    const app = await buildServer();

    // POST 新建会话，用 SDK 追加真实 user/assistant 消息（写 JSONL）
    let res = await app.inject({ method: 'POST', url: '/api/conversations' });
    const id = res.json().id;
    const filePath = await sessionFilePath(id);

    const manager = SessionManager.open(filePath, sessionDir);
    manager.appendMessage({ role: 'user', content: [{ type: 'text', text: '你好 pi' }] });
    manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: '你好！有什么可以帮你？' }] });

    // GET messages：role + text 列表
    res = await app.inject({ method: 'GET', url: `/api/conversations/${id}/messages` });
    assert.equal(res.statusCode, 200);
    const messages = res.json().messages;
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, 'user');
    assert.equal(messages[0].text, '你好 pi');
    assert.equal(messages[1].role, 'assistant');
    assert.ok(messages[1].text.includes('你好'), 'assistant 文本应完整读取');

    // 列表 messageCount / preview 反映历史
    res = await app.inject({ method: 'GET', url: '/api/conversations' });
    const listed = res.json().conversations.find((c: { id: string }) => c.id === id);
    assert.equal(listed.messageCount, 2);
    assert.equal(listed.preview, '你好 pi');

    // 重命名后"重启"（新 buildServer 读同一会话目录）→ 名称与历史都在
    res = await app.inject({
      method: 'PATCH',
      url: `/api/conversations/${id}`,
      headers: { 'content-type': 'application/json' },
      payload: { name: '持久化会话' },
    });
    assert.equal(res.statusCode, 200);

    await app.close();
    const app2 = await buildServer();

    res = await app2.inject({ method: 'GET', url: '/api/conversations' });
    const afterRestart = res.json().conversations.find((c: { id: string }) => c.id === id);
    assert.ok(afterRestart, '重启后会话应恢复');
    assert.equal(afterRestart.name, '持久化会话', '重命名应持久化');
    assert.equal(afterRestart.messageCount, 2);

    res = await app2.inject({ method: 'GET', url: `/api/conversations/${id}/messages` });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().messages.length, 2);
    assert.equal(res.json().messages[0].text, '你好 pi');

    await app2.close();
  } finally {
    await rm(sessionDir, { recursive: true, force: true });
  }
});
