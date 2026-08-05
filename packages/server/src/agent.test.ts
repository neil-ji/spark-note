import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAgentEvent, stringifyToolResult } from './agent.js';
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
