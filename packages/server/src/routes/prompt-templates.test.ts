import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, loadPromptTemplateMetas, type PromptTemplateMeta } from './prompt-templates.js';
import { buildServer } from '../index.js';

test('parseFrontmatter 解析 key: value 标量', () => {
  const { meta, body } = parseFrontmatter(
    '---\ndescription: 写一篇小红书内容\nargument-hint: 内容主题\n---\n\n正文：$1',
  );
  assert.equal(meta.description, '写一篇小红书内容');
  assert.equal(meta['argument-hint'], '内容主题');
  assert.match(body, /正文：\$1/);
});

test('parseFrontmatter 无 frontmatter 时原样返回', () => {
  const { meta, body } = parseFrontmatter('纯文本');
  assert.deepEqual(meta, {});
  assert.equal(body, '纯文本');
});

test('loadPromptTemplateMetas 读取 .pi/prompts 三个模板', async () => {
  const metas = await loadPromptTemplateMetas();
  assert.equal(metas.length, 3);
  const byName = new Map(metas.map((m: PromptTemplateMeta) => [m.name, m]));
  for (const name of ['tingguo-weekly', 'write-xiaohongshu', 'github-trending']) {
    assert.ok(byName.has(name), `${name} 模板应存在`);
    const m = byName.get(name)!;
    assert.ok(m.description.length > 0, `${name} 应有描述`);
    assert.ok(m.argumentHint, `${name} 应有 argumentHint`);
  }
});

test('GET /api/prompt-templates 返回模板元信息', async () => {
  const app = await buildServer();
  const res = await app.inject({ method: 'GET', url: '/api/prompt-templates' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.templates), 'templates 应为数组');
  assert.equal(body.templates.length, 3);
  const first = body.templates[0];
  assert.ok(first.name && first.description, '每项应有 name/description');
  assert.equal('content' in first, false, '不应暴露模板正文');
  await app.close();
});
