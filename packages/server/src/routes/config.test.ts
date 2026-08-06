import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildServer } from '../index.js';
import { THINKING_LEVELS } from '../provider-config.js';

/** 将配置写入路径指向临时目录，测试结束后清理。 */
function withTempConfigPath(dir: string): () => void {
  process.env.PI_CONFIG_PATH = path.join(dir, 'config.json');
  return () => {
    delete process.env.PI_CONFIG_PATH;
  };
}

test('GET /api/config 返回当前生效配置与来源', async () => {
  const app = await buildServer();
  const res = await app.inject({ method: 'GET', url: '/api/config' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.provider, 'anthropic');
  assert.ok(typeof body.modelId === 'string' && body.modelId.length > 0, 'modelId 应为非空字符串');
  assert.ok(THINKING_LEVELS.includes(body.thinkingLevel), 'thinkingLevel 应在允许集合内');
  assert.ok(body.source, '应包含 source 来源说明');
  assert.ok(typeof body.source.modelId === 'string');
  assert.ok(typeof body.source.thinkingLevel === 'string');
  assert.ok(typeof body.configPath === 'string' && body.configPath.length > 0, '应报告配置写盘路径');
  await app.close();
});

test('PUT /api/config 落盘并在"重启"后生效（env > file > default 优先级）', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pi-config-'));
  const restoreConfigPath = withTempConfigPath(dir);
  // 隔离 env，验证 file 层生效路径
  const prevModel = process.env.PI_MODEL;
  const prevThinking = process.env.PI_THINKING;
  const prevBaseUrl = process.env.ANTHROPIC_BASE_URL;
  delete process.env.PI_MODEL;
  delete process.env.PI_THINKING;
  delete process.env.ANTHROPIC_BASE_URL;

  try {
    // 初始：无文件 → 默认值 + source default
    const app = await buildServer();
    let res = await app.inject({ method: 'GET', url: '/api/config' });
    let body = res.json();
    assert.equal(body.modelId, 'claude-haiku-4-5');
    assert.equal(body.source.modelId, 'default');
    assert.equal(body.baseUrl, null);

    // PUT 修改 modelId / thinkingLevel / baseUrl
    res = await app.inject({
      method: 'PUT',
      url: '/api/config',
      headers: { 'content-type': 'application/json' },
      payload: { modelId: 'deepseek-chat', thinkingLevel: 'medium', baseUrl: 'https://example.com/anthropic' },
    });
    assert.equal(res.statusCode, 200);
    body = res.json();
    assert.equal(body.modelId, 'deepseek-chat');
    assert.equal(body.source.modelId, 'file');
    assert.equal(body.saved, true);

    // 文件落盘内容与权限（0600）
    const onDisk = JSON.parse(await readFile(path.join(dir, 'config.json'), 'utf8'));
    assert.equal(onDisk.modelId, 'deepseek-chat');
    assert.equal(onDisk.thinkingLevel, 'medium');
    assert.equal(onDisk.baseUrl, 'https://example.com/anthropic');
    const mode = (await stat(path.join(dir, 'config.json'))).mode & 0o777;
    assert.equal(mode, 0o600, '配置文件权限应为 0600');

    // "重启"语义：新 buildServer 读取同一文件 → 反映新值
    await app.close();
    const app2 = await buildServer();
    res = await app2.inject({ method: 'GET', url: '/api/config' });
    body = res.json();
    assert.equal(body.modelId, 'deepseek-chat');
    assert.equal(body.source.modelId, 'file');
    assert.equal(body.thinkingLevel, 'medium');
    assert.equal(body.baseUrl, 'https://example.com/anthropic');
    await app2.close();

    // env 优先：设置 PI_MODEL 后生效值来自 env，覆盖文件值
    process.env.PI_MODEL = 'env-model';
    const app3 = await buildServer();
    res = await app3.inject({ method: 'GET', url: '/api/config' });
    body = res.json();
    assert.equal(body.modelId, 'env-model');
    assert.equal(body.source.modelId, 'env');
    await app3.close();

    // 清除 baseUrl：PUT null → 文件删除 baseUrl 键，生效值回退官方（null）
    const app4 = await buildServer();
    res = await app4.inject({
      method: 'PUT',
      url: '/api/config',
      headers: { 'content-type': 'application/json' },
      payload: { baseUrl: null },
    });
    assert.equal(res.statusCode, 200);
    body = res.json();
    assert.equal(body.baseUrl, null);
    const afterClear = JSON.parse(await readFile(path.join(dir, 'config.json'), 'utf8'));
    assert.equal('baseUrl' in afterClear, false, '清除 baseUrl 后文件不应保留该键');
    await app4.close();
  } finally {
    restoreConfigPath();
    if (prevModel === undefined) delete process.env.PI_MODEL;
    else process.env.PI_MODEL = prevModel;
    if (prevThinking === undefined) delete process.env.PI_THINKING;
    else process.env.PI_THINKING = prevThinking;
    if (prevBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = prevBaseUrl;
    await rm(dir, { recursive: true, force: true });
  }
});

test('PUT /api/config 非法输入返回 400', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pi-config-'));
  const restoreConfigPath = withTempConfigPath(dir);
  try {
    const app = await buildServer();
    for (const payload of [
      { thinkingLevel: 'ultra' },
      { modelId: '  ' },
      { baseUrl: 'not-a-url' },
    ]) {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/config',
        headers: { 'content-type': 'application/json' },
        payload,
      });
      assert.equal(res.statusCode, 400, `payload ${JSON.stringify(payload)} 应返回 400`);
    }
    await app.close();
  } finally {
    restoreConfigPath();
    await rm(dir, { recursive: true, force: true });
  }
});
