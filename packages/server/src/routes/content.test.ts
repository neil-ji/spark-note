import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../index.js';

test('GET /api/content/issues 列出《听过》各期内容', async () => {
  const app = await buildServer();
  const res = await app.inject({ method: 'GET', url: '/api/content/issues' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.ok(Array.isArray(body.issues), 'issues 应为数组');
  assert.ok(body.issues.length >= 3, '应至少有 3 期');
  for (const issue of body.issues) {
    assert.ok(issue.name, '每期应有 name');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(issue.date), 'date 应为 YYYY-MM-DD');
    assert.equal(typeof issue.number, 'number');
    assert.equal(typeof issue.hasHtml, 'boolean');
    assert.ok(issue.manuscript, '每期应含文稿文本');
    assert.ok(Array.isArray(issue.pngs) && issue.pngs.length > 0, '每期应含 PNG 列表');
  }
  const names = body.issues.map((i: { name: string }) => i.name);
  assert.ok(names.includes('2026-07-19-issue-01'), '应包含第一期');
  await app.close();
});

test('GET /api/content/file/{期}/index.html 提供 HTML 预览', async () => {
  const app = await buildServer();
  const list = await app.inject({ method: 'GET', url: '/api/content/issues' });
  const { issues } = list.json();
  const first = issues.find((i: { htmlUrl: string | null }) => i.htmlUrl);
  assert.ok(first, '应存在带 HTML 的期');
  const res = await app.inject({ method: 'GET', url: first.htmlUrl });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] ?? '', /text\/html/);
  assert.match(res.body, /<!DOCTYPE html>/);
  await app.close();
});

test('GET /api/content/file/{期}/pngs 提供 PNG 预览', async () => {
  const app = await buildServer();
  const list = await app.inject({ method: 'GET', url: '/api/content/issues' });
  const { issues } = list.json();
  const first = issues.find((i: { pngUrls: string[] }) => i.pngUrls.length > 0);
  assert.ok(first, '应存在带 PNG 的期');
  const res = await app.inject({ method: 'GET', url: first.pngUrls[0] });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] ?? '', /image\/png/);
  await app.close();
});
