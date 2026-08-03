# pi Agent 调用 tingguo-weekly SKILL 端到端验证报告

> **验证日期**: 2026-08-03
> **SDK**: `@earendil-works/pi-coding-agent@0.83.0`（Embed SDK）
> **模型**: `claude-opus-4-5`（经本机 gateway 路由 → deepseek-v4-pro）
> **任务**: 端到端验证：agent 调用 tingguo-weekly 产出完整《听过》周刊
> **工作区**: `content/听过/` 新期目录

---

## 1. 验证结果总览

| 验证项 | 结果 | 说明 |
|--------|------|------|
| pi SDK 安装 | ✅ | `@earendil-works/pi-coding-agent@0.83.0` 显式安装于本工作区 |
| SKILL 接入 | ✅ | `.pi/settings.json` `"skills": ["../.claude/skills"]` + SDK `skillsOverride` 双路径，3 个 SKILL 零格式改动加载 |
| LLM 认证（gateway） | ✅ | `.pi/models.json` 覆盖 anthropic `baseUrl → http://127.0.0.1:8787`，`ANTHROPIC_AUTH_TOKEN` 对该 gateway 有效 |
| SKILL 脚本路径适配 | ✅ | `tools/*.mjs` 从 cwd=仓库根 执行，playwright 本地 node_modules 优先解析 |
| Playwright / Chromium | ✅ | 显式安装 playwright@1.62.1；沙箱内 chromium 以 `--single-process --no-zygote` 兜底启动 |
| 完整周刊产出 | <!-- FILL --> | `content/听过/2026-08-03-issue-04/` manuscript + html + pngs |
| 产物完整性 | <!-- FILL --> | 6 个交付物、PNG 非空 |

---

## 2. 关键阻塞点与解法：401 → gateway

**上游阻塞**：直接连 api.anthropic.com 返回 401（本环境 key 非 `sk-ant-` 格式，仅对本机 gateway 有效），agent 执行因此无法真实产出。

**根因**：pi SDK 默认 anthropic baseUrl 指向官方端点，未继承环境变量 `ANTHROPIC_BASE_URL`。

**解法**：`.pi/models.json` 覆盖内置 anthropic provider 的 baseUrl：

```json
{"providers":{"anthropic":{"baseUrl":"http://127.0.0.1:8787"}}}
```

`ModelRuntime.create({ modelsPath: '.pi/models.json' })` 加载后，内置 `claude-*` 模型全部可用。实测 gateway 映射：

| pi 模型 ID | gateway 实际模型 |
|-----------|-----------------|
| claude-haiku-4-5 | deepseek-v4-flash |
| claude-sonnet-4-5 | deepseek-v4-flash |
| claude-opus-4-5 | deepseek-v4-pro |

---

## 3. SKILL 脚本路径适配点

### 3.1 cwd 约定

`tingguo-weekly/tools/*.mjs` 的两个参数（html-file / output-dir）经 `resolve()` 解析，**相对当前工作目录**。因此约定 **cwd = 仓库根目录**：

- `createAgentSession({ cwd: <repo-root> })` 保证 agent 的 read/write/bash 相对路径（`content/听过/…`、`.claude/skills/…`）可解析。
- 运行截图：`node .claude/skills/tingguo-weekly/tools/screenshot.mjs content/听过/<issue>/index.html content/听过/<issue>/pngs`

### 3.2 playwright 解析（本地 node_modules 优先）

原脚本硬编码从父级 `.pnpm` store 发现 playwright（依赖 spark-hub monorepo）。已改为：

```js
try { ({ chromium } = await import('playwright')); }        // 本地 node_modules 优先
catch { /* 兜底：.pnpm store 发现逻辑 */ }
```

`extract-text.mjs` 同样处理。

### 3.3 chromium 启动兜底（macOS 沙箱）

沙箱化 shell 中默认启动失败（Mach-port rendezvous Permission denied），已加兜底：

```js
async function launchChromium() {
  try { return await chromium.launch(); }
  catch { return await chromium.launch({ args: ['--single-process', '--no-zygote'] }); }
}
```

两个脚本共用此逻辑。

---

## 4. 接入方式

### 4.1 `.pi/settings.json`（pi 原生 skills 配置）

```json
{ "skills": ["../.claude/skills"], "enableSkillCommands": true }
```

### 4.2 SDK `skillsOverride`（运行器内二次保证）

```js
const fromClaude = loadSkillsFromDir({ dir: '<repo>/.claude/skills', source: 'claude-skills' });
new DefaultResourceLoader({
  cwd: ROOT, agentDir: getAgentDir(),
  skillsOverride: (base) => { /* 合并 base.skills + fromClaude.skills */ },
});
```

运行器实测加载：`github-trending`、`tingguo-weekly`、`write-xiaohongshu`（+ 全局 `find-skills`）。

### 4.3 运行器

`.pi/run-tingguo-weekly.mjs` — `createAgentSession` + `session.subscribe` 捕获 `agent_start / tool_execution_start / message_update(text_delta) / agent_settled`，`session.prompt(task)` 驱动全流程。

---

## 5. 端到端执行记录

<!-- FILL: 工具调用序列、关键节点、耗时 -->

---

## 6. 验收对照

<!-- FILL: 交付物清单与文件状态 -->

---

## 7. 结论与建议

<!-- FILL -->
