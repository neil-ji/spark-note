# pi Embed SDK Spike 验证报告

> **验证日期**: 2026-08-03
> **SDK 版本**: `@earendil-works/pi-coding-agent@0.83.0`（精确锁定）
> **Node 版本**: v24.18.0 | npm 11.16.0
> **验证范围**: SDK 安装、模型认证链路、流式事件订阅、WebSocket 事件转发
> **参考文档**: 文档库《pi Agent SDK 调研：SDK 程序化接入》（02-SDK-程序化接入.md）

---

## 1. 验证结果总览

| 验证项 | 结果 | 说明 |
|--------|------|------|
| 包安装与锁定 | ✅ 通过 | `@earendil-works/pi-coding-agent@0.83.0` + `ws@8.21.1` 精确版本安装成功 |
| 模型认证链路 | ✅ 通过 | `ModelRuntime` 从 env `ANTHROPIC_AUTH_TOKEN` 自动解析，`hasConfiguredAuth`/`checkAuth` 正常 |
| 401 显式处理 | ✅ 通过 | 注入无效 key → SDK 以 `stopReason="error"` + `errorMessage="401 …"` 暴露，不抛异常 |
| AgentSession 创建 | ✅ 通过 | `createAgentSession()` + `session.subscribe()` + `session.prompt()` 最小链路可用 |
| 事件循环完整性 | ✅ 通过 | 每轮完整触发 `agent_start → turn_start → message_start → message_update×N → message_end → turn_end → agent_end → agent_settled` |
| 流式 text_delta | ✅ 通过 | **真实 LLM 流式输出**被订阅捕获，两轮 prompt 均拿到完整文本（经本机 gateway） |
| WebSocket 转发 | ✅ 通过 | `ws` 最小服务器启动，客户端连接后收到完整事件流并拼装出文本 |
| prompt() 免 streamingBehavior | ✅ 通过 | 空闲状态不传 `streamingBehavior` 调用正常，不抛错 |

> **与上一轮 Spike 相比**：本环境提供本机 gateway（`http://127.0.0.1:8787`），实测该 key 对 gateway 有效，
> 因此**真实 LLM 流式调用跑通了**（上一轮因直连 api.anthropic.com 返回 401 而跳过流式验证）。

---

## 2. 认证链路实测

### 2.1 认证解析链

```
环境变量 ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN（已设置，同值 35 字符）
    ↓
ModelRuntime.create() 自动检测（无需显式传 key）
    ↓
hasConfiguredAuth("anthropic")   → true
checkAuth("anthropic")          → { type: "api_key", source: "ANTHROPIC_AUTH_TOKEN" }
getProviderAuthStatus("anthropic") → { configured: true, source: "environment", label: "ANTHROPIC_AUTH_TOKEN" }
listCredentials()               → []（auth.json 为空 {}，凭据来自环境变量）
```

### 2.2 401 的显式处理（重点）

**实测：0.83.0 不抛异常**，HTTP 401 以返回值暴露：

```javascript
const res = await runtime.completeSimple(model, ctx, { maxTokens: 16 });
res.stopReason;    // "error"
res.errorMessage;  // "401 {\"error\":{\"message\":\"Authentication Fails, ...\"}}"
```

**调用方必须检查 `stopReason === "error"` 并识别 `errorMessage` 中的 `401`**，不能依赖 try/catch。

### 2.3 三个 endpoint 场景实测

| 场景 | 配置 | 结果 |
|------|------|------|
| 有效 key × 本机 gateway | `spike-models.json` 覆盖 baseUrl | ✅ HTTP 200，真实回复文本 |
| 无效 key × 本机 gateway | models.json 注入 `apiKey: "sk-invalid…"` | ⚠️ `stopReason="error"`，`errorMessage="401 …"` |
| 默认 endpoint（api.anthropic.com） | 无覆盖 | ⚠️ `errorMessage="Connection error."`（沙箱网络不可达；生产需 sk-ant- 格式 key） |

**结论**：认证链路完整可用；当前 key 对本机 gateway 有效，对 api.anthropic.com 直连需真实 Anthropic key。

---

## 3. 流式事件验证（真实 LLM 输出）

### 3.1 完整事件循环（每轮）

```
agent_start → turn_start → message_start → message_end
            → message_start → message_update ×N   ← text_delta / thinking_delta 在此
            → message_end → turn_end → agent_end → agent_settled
```

### 3.2 text_delta 捕获结果

两轮 `session.prompt()` 均成功，`event.type === "message_update"` 下 `assistantMessageEvent.type === "text_delta"` 被订阅捕获：

- 第 1 轮（带 `{ streamingBehavior: "followUp" }`）：
  > "大型语言模型是通过海量文本训练、可生成和理解自然语言的深度学习模型。"
- 第 2 轮（**不传 streamingBehavior**，空闲状态）：
  > "中"

观测到的 `assistantMessageEvent` 子类型：`text_start` / `text_delta` / `text_end`（`thinking_delta`、`toolcall_start`、`toolcall_delta` 在类型定义中存在，`thinkingLevel: "off"` 下未触发）。

---

## 4. WebSocket 转发验证

```
客户端 (ws://127.0.0.1:37641)        Node.js 服务器（ws + pi SDK）
        │ ◄── text_delta / agent_* ──│  session.subscribe()
        │ ◄── 完整事件流转发 ─────────│  AgentSession
```

**实测结果**：客户端收到的完整事件序列 `agent_start → turn_start → message_start → message_end → message_start → message_end → turn_end → agent_end → agent_settled`，text_delta 拼装出 43 字符真实回复。

> 服务器在 `connection` 时创建 AgentSession、订阅事件并 `session.prompt()`，事件经 `ws.send(JSON.stringify(payload))` 转发——这正是 spark-note web 后端的事件推送模式。

---

## 5. 实际 API 签名与调研文档的差异（5 处）

以下差异基于实际运行 0.83.0 验证，对照文档库《02-SDK-程序化接入.md》。

### 5.1 `prompt()` 不强制 `streamingBehavior`

- **文档（2.5 节）**：不带 `streamingBehavior` 调用 `prompt()` 会抛错
- **实测**：空闲状态下不传也不抛错（仅当 agent run 正在流式时才要求）
  ```javascript
  await session.prompt("…");                            // ✅ 空闲状态正常
  await session.prompt("…", { streamingBehavior: "followUp" }); // ✅ 也正常
  ```

### 5.2 `ModelRuntime.create()` 选项更多

- **文档（2.3 节）**：`ModelRuntime.create({ authPath, modelsPath })`
- **实测**：完整选项 8 个 — `credentials`、`authPath`、`modelsPath`、`modelsStore`、`modelsStorePath`、`allowModelNetwork`（默认 `false`，开启才网络刷新模型）、`modelRefreshTimeoutMs`、`catalogBaseUrl`

### 5.3 `SessionManager.create()` 签名带第二参数

- **文档（2.3 节）**：`SessionManager.create(process.cwd())`
- **实测**：`create(cwd, sessionDir?, options?: NewSessionOptions)` — 第二参数 `sessionDir` 指定持久化目录；`inMemory(cwd?, options?)`

### 5.4 模型能力属性名：`reasoning` 而非 `supportsThinking`

- **文档/预期**：`model.supportsThinking`
- **实测**：`model.reasoning`（boolean）与 `model.thinkingLevelMap`（如 `{ xhigh: "xhigh", max: "max" }`）；`supportsThinking` 不存在（undefined）

### 5.5 `getAvailable()` 返回值

- **上一轮记录**：`getAvailable()` 返回空对象 `{}`，应改用 `getAvailableSnapshot()`
- **本次实测**：`getAvailable()` 返回模型数组（15 条，与 `getAvailableSnapshot()` 一致）——差异未复现，标注**待确认**（可能取决于认证/模型缓存状态）

### 附注：事件结构细节

`text_delta` 嵌套于 `event.type === "message_update"` 的 `event.assistantMessageEvent.type === "text_delta"`，与调研文档一致；`toolcall_start` / `toolcall_delta` 事件类型在 pi-ai 类型定义中确认存在。

---

## 6. 关键发现与对 spark-note 的影响

### 可直接用的结论

1. **`createAgentSession` + `session.subscribe` + `session.prompt`** 最小链路跑通，流式 text_delta 可捕获 → 可直接作为 web 后端对话能力的骨架。
2. **WebSocket 转发模式** 已验证 → `verify-websocket.mjs` 可作服务器模块模板。
3. **`SessionManager.inMemory()`** 单用户 MVP 够用；持久化切 `SessionManager.create(cwd, sessionDir)`。
4. **`ModelRuntime`** 自动从 env 读 key，无需显式配置；可通过 `modelsPath` 覆盖 provider `baseUrl` 指向自定义 gateway（本 Spike 即用此机制）。
5. **401 必须检查 `stopReason === "error"`** —— SDK 不抛异常，后端需显式透传给前端。

### 需要留意的

1. **key 管理**：当前 key 仅对本机 gateway 有效；生产直连 api.anthropic.com 需真实 `sk-ant-` key。
2. **模型选择**：默认模型可能是昂贵大模型，建议 `createAgentSession({ model })` 显式指定（本 Spike 用 `claude-haiku-4-5`）。
3. **Skills 接入**（`skillsOverride` / additionalExtensionPaths）未在本次验证范围，属下一步。

---

## 7. 验证文件清单

```
spike-pi-sdk/
├── package.json              # 锁定 @earendil-works/pi-coding-agent@0.83.0、ws@8.21.1
├── package-lock.json
├── spike-models.json         # anthropic baseUrl → 本机 gateway 覆盖（流式验证用）
├── verify-auth.mjs           # 认证链路 + 401 显式处理
├── verify-streaming.mjs      # 流式事件订阅（真实 text_delta）
├── verify-websocket.mjs      # ws 服务器 + 客户端事件转发
└── SPIKE-REPORT.md           # 本报告
```

运行方式：

```bash
cd spike-pi-sdk
npm install
npm run verify:auth        # node verify-auth.mjs
npm run verify:streaming   # node verify-streaming.mjs
npm run verify:websocket   # node verify-websocket.mjs
```
