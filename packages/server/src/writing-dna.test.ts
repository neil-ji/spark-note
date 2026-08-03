import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from './index.js';
import { parseCoreRules } from './writing-dna.js';

test('GET /api/writing-dna 返回全部 DNA 文档与 10 条核心规则', async () => {
  const app = await buildServer();
  const res = await app.inject({ method: 'GET', url: '/api/writing-dna' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.docs), 'docs 应为数组');
  assert.ok(body.docs.length >= 5, '应返回至少 5 份 DNA 文档');

  const main = body.docs.find((d: { slug: string }) => d.slug === 'Writing-DNA');
  assert.ok(main, '应包含整合文档 Writing-DNA.md');
  assert.ok(main.raw.includes('核心规则'), '整合文档应包含核心规则章节');
  assert.ok(main.title.length > 0, '应解析出文档标题');

  assert.equal(body.rules.length, 10, '核心规则应为 10 条');
  assert.equal(body.rules[0].index, 1, '规则序号从 1 开始');
  assert.ok(body.rules[0].title.length > 0, '规则应解析出加粗标题');
  assert.ok(body.rules[0].detail.length > 0, '规则应解析出详情');
  await app.close();
});

test('parseCoreRules 从「核心规则」章节解析编号规则', () => {
  const raw = [
    '# 标题',
    '## 核心规则(可执行)',
    '1. **甲**:内容甲;分号收尾',
    '2. **乙**:内容乙',
    '10. **丙**("**有风险**")',
    '## 分体速查',
  ].join('\n');
  const rules = parseCoreRules(raw);
  assert.equal(rules.length, 3);
  assert.equal(rules[0].index, 1);
  assert.equal(rules[0].title, '甲');
  assert.equal(rules[0].detail, '内容甲;分号收尾');
  assert.equal(rules[2].detail, '("**有风险**")');
});

test('parseCoreRules 无加粗条目整条作标题', () => {
  const rules = parseCoreRules('## 核心规则\n1. 纯文本规则\n');
  assert.equal(rules.length, 1);
  assert.equal(rules[0].title, '纯文本规则');
  assert.equal(rules[0].detail, '');
});

test('parseCoreRules 缺少章节时返回空数组', () => {
  assert.equal(parseCoreRules('## 其他\n1. **x**:y\n').length, 0);
});
