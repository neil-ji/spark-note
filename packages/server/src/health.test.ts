import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from './index.js';

test('GET /api/health 返回 ok', async () => {
  const app = await buildServer();
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'spark-note');
  await app.close();
});

test('未知 API 路由返回 404', async () => {
  const app = await buildServer();
  const res = await app.inject({ method: 'GET', url: '/api/nope' });
  assert.equal(res.statusCode, 404);
  await app.close();
});
