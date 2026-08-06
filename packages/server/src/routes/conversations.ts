import { existsSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import {
  CURRENT_SESSION_VERSION,
  SessionManager,
  type SessionEntry,
  type SessionInfo,
  type SessionMessageEntry,
} from '@earendil-works/pi-coding-agent';
import { REPO_ROOT, SESSION_DIR } from '../repo-paths.js';

/**
 * 会话管理 API：基于 pi SDK SessionManager 的 JSONL 会话（.pi/sessions/）。
 *   GET    /api/conversations            —— 全部会话，按 modified 倒序
 *   POST   /api/conversations            —— 新建会话，返回 id（落盘 header）
 *   GET    /api/conversations/:id/messages —— 历史消息（role + text 列表）
 *   PATCH  /api/conversations/:id        —— 重命名（写入 session_info 条目）
 *   DELETE /api/conversations/:id        —— 删除会话 JSONL 文件
 *
 * 真实 pi 会话持久化，禁止 mock。会话切换（把活动对话指到目标会话）为后续增强，
 * 本 API 只负责会话的建查改删。
 */

const PREVIEW_MAX_LENGTH = 100;
/** 空会话时 buildSessionInfo 返回的 firstMessage 占位。 */
const NO_MESSAGES = '(no messages)';

function truncatePreview(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= PREVIEW_MAX_LENGTH ? t : `${t.slice(0, PREVIEW_MAX_LENGTH)}…`;
}

/** SessionInfo → API 列表项（name 为空时由前端回退到首条消息）。 */
function mapSessionInfo(info: SessionInfo): {
  id: string;
  name: string;
  created: string;
  modified: string;
  messageCount: number;
  preview: string;
} {
  const first = info.firstMessage === NO_MESSAGES ? '' : info.firstMessage;
  return {
    id: info.id,
    name: info.name ?? '',
    created: info.created.toISOString(),
    modified: info.modified.toISOString(),
    messageCount: info.messageCount,
    preview: truncatePreview(first),
  };
}

/** 在会话目录中按 id 找到对应 JSONL 文件；不存在返回 null。 */
async function findSessionFile(id: string): Promise<string | null> {
  const sessions = await SessionManager.list(REPO_ROOT, SESSION_DIR);
  const info = sessions.find((s) => s.id === id);
  return info?.path ?? null;
}

/** 提取消息文本：text 块 + thinking 块 + toolCall 简要标记。 */
function extractMessageText(message: { content?: unknown }): string {
  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content as Array<Record<string, unknown>>) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    else if (block?.type === 'thinking' && typeof block.thinking === 'string') parts.push(block.thinking);
    else if ((block?.type === 'toolCall' || block?.type === 'tool_use') && typeof block.name === 'string') {
      parts.push(`[tool_use: ${block.name}]`);
    }
  }
  return parts.join('\n');
}

/** 会话条目 → role + text 消息列表（跳过无文本内容的消息）。 */
function entriesToMessages(entries: SessionEntry[]): { role: string; text: string }[] {
  const messages: { role: string; text: string }[] = [];
  for (const entry of entries) {
    if (entry.type !== 'message') continue;
    const msg = (entry as SessionMessageEntry).message;
    if (!msg || typeof msg.role !== 'string') continue;
    const text = extractMessageText(msg as unknown as { content?: unknown }).trim();
    if (!text) continue;
    messages.push({ role: msg.role, text });
  }
  return messages;
}

export async function registerConversationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/conversations', async () => {
    const sessions = await SessionManager.list(REPO_ROOT, SESSION_DIR);
    return { conversations: sessions.map(mapSessionInfo) };
  });

  app.post('/api/conversations', async (_, reply) => {
    const manager = SessionManager.create(REPO_ROOT, SESSION_DIR);
    const id = manager.getSessionId();
    const filePath = manager.getSessionFile();
    // SDK 延迟到首个 assistant 消息才写盘；这里主动落 header，保证空会话可被列出/重命名/删除。
    if (filePath && !existsSync(filePath)) {
      const header = {
        type: 'session',
        version: CURRENT_SESSION_VERSION,
        id,
        timestamp: new Date().toISOString(),
        cwd: manager.getCwd(),
      };
      writeFileSync(filePath, `${JSON.stringify(header)}\n`);
    }
    reply.code(201);
    return { id };
  });

  app.get<{ Params: { id: string } }>('/api/conversations/:id/messages', async (req, reply) => {
    const filePath = await findSessionFile(req.params.id);
    if (!filePath) {
      reply.code(404);
      return { error: `会话不存在: ${req.params.id}` };
    }
    const manager = SessionManager.open(filePath, SESSION_DIR);
    return {
      id: req.params.id,
      name: manager.getSessionName() ?? '',
      messages: entriesToMessages(manager.getEntries()),
    };
  });

  app.patch<{ Params: { id: string }; Body: { name?: unknown } }>('/api/conversations/:id', async (req, reply) => {
    const filePath = await findSessionFile(req.params.id);
    if (!filePath) {
      reply.code(404);
      return { error: `会话不存在: ${req.params.id}` };
    }
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      reply.code(400);
      return { error: 'name 不能为空' };
    }
    const manager = SessionManager.open(filePath, SESSION_DIR);
    manager.appendSessionInfo(name);
    return { id: req.params.id, name };
  });

  app.delete<{ Params: { id: string } }>('/api/conversations/:id', async (req, reply) => {
    const filePath = await findSessionFile(req.params.id);
    if (!filePath) {
      reply.code(404);
      return { error: `会话不存在: ${req.params.id}` };
    }
    await rm(filePath, { force: true });
    return { id: req.params.id, deleted: true };
  });
}
