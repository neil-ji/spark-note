import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../index.js';

test('GET /api/writing-dna 列出全部 DNA 文档', async () => {
  const app = await buildServer();
  const res = await app.inject({ method: 'GET', url: '/api/writing-dna' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.docs), 'docs 应为数组');
  assert.ok(body.docs.length >= 4, '应至少有 4 份 DNA 文档');
  const slugs = body.docs.map((d: { slug: string }) => d.slug);
  assert.ok(slugs.includes('Writing-DNA'), '应包含主文档 Writing-DNA');
  assert.ok(slugs.includes('语言DNA'), '应包含 语言DNA');
  for (const doc of body.docs) {
    assert.ok(doc.title, '每个文档应有 title');
    assert.ok(typeof doc.blockCount === 'number' && doc.blockCount > 0, 'blockCount 应为正数');
  }
  await app.close();
});

test('GET /api/writing-dna/Writing-DNA 返回结构化块与规则清单', async () => {
  const app = await buildServer();
  const res = await app.inject({ method: 'GET', url: '/api/writing-dna/Writing-DNA' });
  assert.equal(res.statusCode, 200);
  const { doc } = res.json();
  assert.equal(doc.slug, 'Writing-DNA');
  assert.ok(Array.isArray(doc.blocks) && doc.blocks.length > 0);

  const kinds = new Set(doc.blocks.map((b: { kind: string }) => b.kind));
  assert.ok(kinds.has('heading') && kinds.has('list'), '应解析出标题与列表块');

  assert.ok(Array.isArray(doc.checklist), '主文档应附带规则对照清单');
  const groupIds = doc.checklist.map((g: { id: string }) => g.id);
  assert.ok(groupIds.includes('core') && groupIds.includes('negative'));
  const core = doc.checklist.find((g: { id: string }) => g.id === 'core');
  assert.equal(core.items.length, 10, '核心规则应为 10 条');
  await app.close();
});

test('GET /api/writing-dna/不存在的文档 返回 404', async () => {
  const app = await buildServer();
  const res = await app.inject({ method: 'GET', url: '/api/writing-dna/no-such-doc' });
  assert.equal(res.statusCode, 404);
  await app.close();
});
