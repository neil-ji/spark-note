import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeAgentEvent, stringifyToolResult, getSessionSnapshot } from './agent.js';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';

function ev(value: unknown): AgentSessionEvent {
  return value as AgentSessionEvent;
}

test('normalizeAgentEvent: text_delta / thinking_delta / toolcall_delta 归一化为 delta', () => {
  const text = normalizeAgentEvent(ev({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '你好' } }));
  assert.deepEqual(text, { kind: 'delta', sub: 'text', delta: '你好' });

  const think = normalizeAgentEvent(ev({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '让我想想' } }));
  assert.deepEqual(think, { kind: 'delta', sub: 'thinking', delta: '让我想想' });

  const tool = normalizeAgentEvent(ev({ type: 'message_update', assistantMessageEvent: { type: 'toolcall_delta', delta: '{"command":"' } }));
  assert.deepEqual(tool, { kind: 'delta', sub: 'toolcall', delta: '{"command":"' });
});

test('normalizeAgentEvent: toolcall_end 带 toolCall id 与 name', () => {
  const event = normalizeAgentEvent(
    ev({
      type: 'message_update',
      assistantMessageEvent: { type: 'toolcall_end', toolCall: { id: 'call_1', name: 'read' } },
    }),
  );
  assert.deepEqual(event, { kind: 'toolcall_end', id: 'call_1', name: 'read' });
});

test('normalizeAgentEvent: 工具执行开始/结束携带 toolCallId / name / isError', () => {
  const start = normalizeAgentEvent(ev({ type: 'tool_execution_start', toolCallId: 'call_1', toolName: 'bash', args: { command: 'pwd' } }));
  assert.deepEqual(start, { kind: 'tool_start', id: 'call_1', name: 'bash', args: { command: 'pwd' } });

  const end = normalizeAgentEvent(
    ev({
      type: 'tool_execution_end',
      toolCallId: 'call_1',
      toolName: 'bash',
      isError: true,
      result: { content: [{ type: 'text', text: 'command not found' }] },
    }),
  );
  assert.deepEqual(end, { kind: 'tool_end', id: 'call_1', name: 'bash', isError: true, result: 'command not found' });
});

test('normalizeAgentEvent: message 起止与队列更新', () => {
  assert.deepEqual(
    normalizeAgentEvent(ev({ type: 'message_start', message: { role: 'assistant' } })),
    { kind: 'message_start', role: 'assistant' },
  );
  assert.deepEqual(
    normalizeAgentEvent(ev({ type: 'queue_update', steering: ['a'], followUp: ['b', 'c'] })),
    { kind: 'queue_update', steering: ['a'], followUp: ['b', 'c'] },
  );
});

test('normalizeAgentEvent: 不关心的类型返回 null', () => {
  assert.equal(normalizeAgentEvent(ev({ type: 'agent_end', messages: [] })), null);
  assert.equal(normalizeAgentEvent(ev({ type: 'compaction_start', reason: 'manual' })), null);
});

test('stringifyToolResult 提取 content 文本块', () => {
  const text = stringifyToolResult({ content: [{ type: 'text', text: 'line1' }, { type: 'text', text: 'line2' }] });
  assert.equal(text, 'line1\nline2');
  assert.equal(stringifyToolResult('raw string'), 'raw string');
  assert.equal(stringifyToolResult(null), '');
  assert.equal(stringifyToolResult(undefined), '');
});

/**
 * WS 会话快照的 model 字段来自生效配置（env > .pi/config.json > 默认值）。
 *
 * 运行时未创建（runtimePromise 为 undefined）时，getSessionSnapshot 走 initializing
 * 回退分支，直接反映当前生效的 modelId / thinkingLevel —— 这是"配置改动后 WS 快照
 * model 字段变化"的可确定性验证（无需真实网络 / 凭据）。
 */
test('getSessionSnapshot 反映 .pi/config.json 中的 model/thinking 配置', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pi-snapshot-'));
  const configPath = path.join(dir, 'config.json');
  const prevModel = process.env.PI_MODEL;
  const prevThinking = process.env.PI_THINKING;
  process.env.PI_CONFIG_PATH = configPath;
  delete process.env.PI_MODEL;
  delete process.env.PI_THINKING;

  try {
    await writeFile(configPath, JSON.stringify({ modelId: 'snapshot-model', thinkingLevel: 'high' }));
    const snap = await getSessionSnapshot();
    assert.equal(snap.status, 'initializing');
    assert.equal(snap.model, 'snapshot-model');
    assert.equal(snap.thinkingLevel, 'high');
  } finally {
    delete process.env.PI_CONFIG_PATH;
    if (prevModel === undefined) delete process.env.PI_MODEL;
    else process.env.PI_MODEL = prevModel;
    if (prevThinking === undefined) delete process.env.PI_THINKING;
    else process.env.PI_THINKING = prevThinking;
    await rm(dir, { recursive: true, force: true });
  }
});

test('getSessionSnapshot：env 优先于 .pi/config.json（快照 model 字段来自 env）', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pi-snapshot-'));
  const configPath = path.join(dir, 'config.json');
  const prevModel = process.env.PI_MODEL;
  const prevThinking = process.env.PI_THINKING;
  process.env.PI_CONFIG_PATH = configPath;
  delete process.env.PI_MODEL;
  delete process.env.PI_THINKING;

  try {
    await writeFile(configPath, JSON.stringify({ modelId: 'file-model', thinkingLevel: 'medium' }));
    process.env.PI_MODEL = 'env-model';
    process.env.PI_THINKING = 'high';
    const snap = await getSessionSnapshot();
    assert.equal(snap.model, 'env-model');
    assert.equal(snap.thinkingLevel, 'high');
  } finally {
    delete process.env.PI_CONFIG_PATH;
    if (prevModel === undefined) delete process.env.PI_MODEL;
    else process.env.PI_MODEL = prevModel;
    if (prevThinking === undefined) delete process.env.PI_THINKING;
    else process.env.PI_THINKING = prevThinking;
    await rm(dir, { recursive: true, force: true });
  }
});
