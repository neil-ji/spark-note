# pi Agent SDK 程序化接入 —— 三条路径对比

> **调研日期**: 2026-08-03  
> **信息来源**: https://pi.dev/docs/latest/sdk、/rpc、/json

---

## 1. 三条路径概览

pi 提供三种程序化接入方式，适用于不同集成场景：

| 路径 | 类型 | 进程 | 适用场景 |
|------|------|------|---------|
| **Embed SDK** | Node.js API（同进程） | 同进程 | Node.js web 后端嵌入、自定义 UI、自动化流水线 |
| **RPC 模式** | stdin/stdout JSONL（跨进程） | 子进程 | 跨语言集成、进程隔离、IDE 插件 |
| **JSON Event Stream** | stdout JSON 行（单向） | 子进程 | 工具链集成、管道处理、日志/监控 |

---

## 2. 路径一：Embed SDK（推荐用于 Node.js web 后端）

### 2.1 安装

```bash
npm install @earendil-works/pi-coding-agent
```

SDK 包含在主包中，无需单独安装。

### 2.2 最小示例

```typescript
import { createAgentSession } from "@earendil-works/pi-coding-agent";

const { session } = await createAgentSession({
  tools: ["read", "bash", "edit", "write"],
  // 模型可选：不传则从会话恢复 → 设置默认 → 第一个可用模型
});

// 订阅流式事件
session.subscribe((event) => {
  if (event.type === "message_update") {
    const delta = event.assistantMessageEvent;
    if (delta.type === "text_delta") {
      process.stdout.write(delta.delta);  // 流式输出文本
    }
  }
  if (event.type === "agent_end") {
    console.log("\n--- Agent 完成 ---");
    session.dispose();
  }
});

// 发送提示
await session.prompt("请帮我分析这个项目的代码结构");
```

### 2.3 完整配置示例

```typescript
import {
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
  ModelRuntime,
  defineTool,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

async function main() {
  // 1. 模型运行时（管理认证与模型发现）
  const modelRuntime = ModelRuntime.create({
    authPath: "~/.pi/agent/auth.json",
    modelsPath: "~/.pi/agent/models.json",
  });

  // 2. 资源加载器（扩展、技能、提示模板、主题）
  const loader = new DefaultResourceLoader({
    systemPromptOverride: () => `You are a content operations agent for spark-note.
Your job: manage project content, invoke skills, and produce Xiaohongshu posts.`,
    additionalExtensionPaths: [],
    skillsOverride: (skills) => {
      // 合并自定义技能
      return skills;
    },
  });

  // 3. 会话管理器（持久化或内存）
  const sessionManager = SessionManager.inMemory();
  // 持久化：SessionManager.create(process.cwd())

  // 4. 自定义工具
  const myTool = defineTool({
    name: "publish_xiaohongshu",
    label: "发布小红书",
    description: "发布内容到小红书平台",
    parameters: Type.Object({
      title: Type.String({ description: "标题" }),
      content: Type.String({ description: "正文" }),
      tags: Type.Array(Type.String(), { description: "标签列表" }),
    }),
    async execute(toolCallId, params, signal, onUpdate) {
      // 实际发布逻辑
      return {
        content: [{ type: "text", text: `已发布: ${params.title}` }],
        details: { published: true, title: params.title },
      };
    },
  });

  // 5. 创建会话
  const { session, extensionsResult } = await createAgentSession({
    modelRuntime,
    resourceLoader: loader,
    sessionManager,
    tools: ["read", "bash", "edit", "write", "publish_xiaohongshu"],
    customTools: [myTool],
    thinkingLevel: "medium",
    cwd: "/path/to/spark-note",
  });

  // 6. 订阅事件（构建 web UI 的关键）
  const unsub = session.subscribe((event) => {
    switch (event.type) {
      case "message_update": {
        const e = event.assistantMessageEvent;
        if (e.type === "text_delta") {
          // → WebSocket 推送文本增量到浏览器
          sendToClient({ type: "text", delta: e.delta });
        } else if (e.type === "thinking_delta") {
          // → 推送思考过程
          sendToClient({ type: "thinking", delta: e.delta });
        } else if (e.type === "toolcall_start") {
          // → 通知前端工具调用开始
          sendToClient({ type: "tool_start", tool: e.name });
        }
        break;
      }
      case "tool_execution_start":
        sendToClient({ type: "tool_exec", tool: event.toolName });
        break;
      case "tool_execution_end":
        sendToClient({
          type: "tool_done",
          tool: event.toolName,
          isError: event.isError,
        });
        break;
      case "turn_end":
        sendToClient({
          type: "turn_complete",
          message: event.message,
          toolResults: event.toolResults,
        });
        break;
      case "agent_settled":
        sendToClient({ type: "agent_done" });
        break;
      case "queue_update":
        sendToClient({
          type: "queue",
          steering: event.steering,
          followUp: event.followUp,
        });
        break;
    }
  });

  // 7. 流式期间转向
  // session.steer("请同时考虑安全性");   // 当前工具调用后投递
  // session.followUp("检查是否完整");    // agent 完全停止后投递

  return { session, unsub };
}
```

### 2.4 AgentSessionRuntime（会话替换）

当需要替换活动会话（new/resume/fork/import）并重建 cwd 绑定运行时状态时，使用 `AgentSessionRuntime`：

```typescript
import { createAgentSessionRuntime } from "@earendil-works/pi-coding-agent";

const runtime = createAgentSessionRuntime(async () => {
  const resourceLoader = new DefaultResourceLoader();
  const modelRuntime = ModelRuntime.create({ /* ... */ });
  const sessionManager = SessionManager.inMemory();

  const { session } = await createAgentSession({
    modelRuntime,
    resourceLoader,
    sessionManager,
  });
  return session;
});

// 初始会话
await runtime.session.prompt("Hello");

// 新建会话
await runtime.newSession();
await runtime.session.prompt("New context");

// Fork 到历史消息
await runtime.fork(someEntryId);
```

**关键行为**：
- `runtime.session` 在 `newSession()`/`fork()`/`switchSession()` 后会变化
- 事件订阅绑定到特定 `AgentSession`，替换后需重新订阅
- 扩展也需重新绑定：`runtime.session.bindExtensions(...)`

### 2.5 Prompt 选项

```typescript
interface PromptOptions {
  expandPromptTemplates?: boolean;  // 展开提示模板
  images?: ImageContent[];          // 图片输入
  streamingBehavior?: "steer" | "followUp";  // 流式期间行为
  source?: InputSource;
  preflightResult?: (success: boolean) => void;
}
```

**流式期间规则**：
- 不带 `streamingBehavior` 调用 `prompt()` 会抛错
- `steer()` 在当前 assistant 轮次完成工具调用后投递
- `followUp()` 在 agent 完全停止后才投递
- 扩展命令（`/command`）即使在流式期间也立即执行

### 2.6 适用场景

✅ **推荐**：Node.js web 后端嵌入、构建自定义 UI、自动化流水线、需要类型安全和直接状态访问  
✅ **优势**：同进程（零序列化开销）、完整 TypeScript 类型、直接访问 agent 状态、可编程定制工具/扩展  
❌ **限制**：仅 Node.js、同进程（无法隔离崩溃）、需管理会话生命周期

---

## 3. 路径二：RPC 模式（stdin/stdout JSONL）

### 3.1 启动

```bash
pi --mode rpc [--provider anthropic] [--model claude-sonnet-4-5] [--no-session] [--name "my-task"]
```

### 3.2 协议

**命令** → stdin（每行一个 JSON）  
**响应** → stdout（`{"type":"response",...}`）  
**事件** → stdout（`{"type":"agent_start",...}` 等）

### 3.3 Node.js 客户端示例

```typescript
import { spawn } from "child_process";
import { StringDecoder } from "string_decoder";

const pi = spawn("pi", ["--mode", "rpc", "--no-session"], {
  stdio: ["pipe", "pipe", "pipe"],
});

const decoder = new StringDecoder("utf8");
let buffer = "";

// 读取 stdout（JSONL 行）
pi.stdout.on("data", (chunk: Buffer) => {
  buffer += decoder.write(chunk);
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);

    if (event.type === "response") {
      console.log("响应:", event.success ? "成功" : `失败: ${event.error}`);
    } else if (event.type === "message_update") {
      const e = event.assistantMessageEvent;
      if (e?.type === "text_delta") {
        process.stdout.write(e.delta);
      }
    } else if (event.type === "agent_end") {
      console.log("\n--- 完成 ---");
    }
  }
});

// 发送命令
function send(cmd: object) {
  pi.stdin.write(JSON.stringify(cmd) + "\n");
}

// 发送提示
send({ type: "prompt", text: "分析这个项目" });

// 流式期间转向
send({ type: "steer", text: "同时检查安全性" });

// 中止
send({ type: "abort" });

// Bash 命令（可带 id 关联事件）
send({ type: "bash", command: "ls -la", id: "my-bash-1" });

// 获取状态
send({ type: "get_state" });
```

### 3.4 JSONL 帧格式注意事项

- 严格 JSONL：LF (`\n`) 是唯一记录分隔符
- 客户端应仅按 `\n` 分割，去除尾部 `\r`
- **Node.js `readline` 不兼容**：它会将 `U+2028`/`U+2029` 当作换行符处理，这些字符在 JSON 字符串内是合法的

### 3.5 扩展 UI 子协议

RPC 模式下，扩展的对话框方法（`select`/`confirm`/`input`/`editor`）会：

1. 向 stdout 发送 `extension_ui_request` 事件
2. 阻塞等待客户端通过 stdin 发送 `extension_ui_response`

```typescript
// 服务端发送
// → stdout: {"type":"extension_ui_request","id":"req-1","method":"confirm","params":{"message":"确定删除?"}}

// 客户端响应
// → stdin:  {"type":"extension_ui_response","id":"req-1","confirmed":true}
```

Fire-and-forget 方法（`notify`/`setStatus`/`setWidget`）不需要响应。

### 3.6 适用场景

✅ **推荐**：跨语言集成（Python/Go/Rust 后端）、进程隔离需求、IDE/编辑器插件  
✅ **优势**：语言无关、进程崩溃隔离、可复用 CLI 的所有功能  
❌ **限制**：JSON 序列化开销、无类型安全、需手动实现 JSONL 帧解析、UI 子协议增加复杂度

---

## 4. 路径三：JSON Event Stream 模式

### 4.1 启动

```bash
pi --mode json "Your prompt" 2>/dev/null
```

### 4.2 输出格式

每行一个 JSON 事件，第一行是会话头：

```json
{"type":"session","version":3,"id":"uuid","timestamp":"...","cwd":"/path"}
{"type":"agent_start"}
{"type":"turn_start"}
{"type":"message_start","message":{"role":"assistant","content":[],...}}
{"type":"message_update","message":{...},"assistantMessageEvent":{"type":"text_delta","delta":"Hello",...}}
{"type":"message_end","message":{...}}
{"type":"turn_end","message":{...},"toolResults":[]}
{"type":"agent_end","messages":[...]}
```

### 4.3 管道消费示例

```bash
# 提取所有助手文本
pi --mode json "List files" 2>/dev/null | \
  jq -c 'select(.type == "message_update" and .assistantMessageEvent.type == "text_delta") | .assistantMessageEvent.delta'

# 提取工具调用
pi --mode json "Read package.json" 2>/dev/null | \
  jq -c 'select(.type == "tool_execution_start") | {tool: .toolName, args: .args}'

# 提取最终消息
pi --mode json "Analyze this code" 2>/dev/null | \
  jq -c 'select(.type == "message_end") | .message'
```

### 4.4 Node.js 集成示例

```typescript
import { spawn } from "child_process";

function runJsonMode(prompt: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const pi = spawn("pi", ["--mode", "json", prompt, "--no-session"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const events: any[] = [];
    let buffer = "";

    pi.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          events.push(JSON.parse(line));
        } catch {}
      }
    });

    pi.on("close", (code) => {
      if (code === 0) resolve(events);
      else reject(new Error(`pi exited with code ${code}`));
    });

    pi.stderr.on("data", (d) => console.error("stderr:", d.toString()));
  });
}
```

### 4.5 适用场景

✅ **推荐**：管道处理、工具链集成、日志/监控采集、简单的"一问一答"自动化  
✅ **优势**：最简单（单向流，无需 stdin 交互）、易于管道消费（`jq`、shell 脚本）、stdout/stderr 分离  
❌ **限制**：无交互能力（无 stdin 命令）、无会话管理、无转向/排队、仅适合单轮或预设多轮

---

## 5. 三条路径对比矩阵

| 维度 | Embed SDK | RPC 模式 | JSON Event Stream |
|------|-----------|----------|-------------------|
| **语言要求** | Node.js/TypeScript | 任意（通过子进程） | 任意（通过子进程） |
| **类型安全** | ✅ 完整 TypeScript | ❌ JSON 字符串 | ❌ JSON 字符串 |
| **进程隔离** | ❌ 同进程 | ✅ 子进程 | ✅ 子进程 |
| **序列化开销** | 无 | JSON 序列化 | JSON 序列化 |
| **交互能力** | ✅ 完整（steer/followUp/abort） | ✅ 完整（steer/follow_up/abort） | ❌ 单向输出 |
| **会话管理** | ✅ SessionManager API | ✅ get_state/new_session/fork | ❌ 无 |
| **自定义工具** | ✅ defineTool + customTools | ❌ 仅内置+扩展工具 | ❌ 仅内置+扩展工具 |
| **扩展加载** | ✅ ResourceLoader 控制 | ✅ 自动加载 | ✅ 自动加载 |
| **事件粒度** | 全事件类型 | 全事件类型 | 全事件类型 |
| **崩溃隔离** | 无（crash 影响宿主） | ✅ 子进程崩溃不影响宿主 | ✅ 子进程崩溃不影响宿主 |
| **UI 集成** | 自定义事件 → WebSocket | extension_ui 子协议 | 无 |
| **复杂度** | 中 | 高（JSONL 帧 + UI 子协议） | 低 |

---

## 6. 对 spark-note web 端智能体的推荐

### 推荐：Embed SDK 路径

**理由**：
1. spark-note 的 web 后端是 Node.js 生态，与 pi SDK 原生匹配
2. 需要完整类型安全（TypeScript 前后端类型共享）
3. 需要自定义工具（`publish_xiaohongshu`、内容管理 API 等）
4. 需要 WebSocket 实时推送流式事件到浏览器
5. 需要会话管理（每用户独立会话、持久化、分支）
6. 需要动态模型切换和思考级别控制

### 备选：RPC 模式

**适用场景**：
- 需要强进程隔离（将 agent 进程沙箱化）
- 后端不是 Node.js（但 spark-note 是 Node.js）
- 多用户部署需要每个用户独立 pi 进程

### 不推荐：JSON Event Stream

仅适合简单的"输入-输出"自动化，无法满足 web 端智能体的交互需求。

---

## 7. Web 集成架构示意（Embed SDK）

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React/Vue)                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ Chat UI  │  │ Content  │  │ Writing DNA Viz      │  │
│  │          │  │ Manager  │  │                      │  │
│  └────┬─────┘  └────┬─────┘  └──────────┬───────────┘  │
│       │             │                   │               │
│       └─────────────┼───────────────────┘               │
│                     │ WebSocket                         │
└─────────────────────┼───────────────────────────────────┘
                      │
┌─────────────────────┼───────────────────────────────────┐
│  Node.js Server     │                                    │
│  ┌──────────────────▼──────────────────────────────────┐│
│  │  WebSocket Manager                                  ││
│  │  - 每用户一个 AgentSession                           ││
│  │  - 事件 → WebSocket 推送                            ││
│  │  - WebSocket 消息 → session.prompt()/steer()        ││
│  └──────────────────┬──────────────────────────────────┘│
│                     │                                    │
│  ┌──────────────────▼──────────────────────────────────┐│
│  │  AgentSession (pi SDK)                              ││
│  │  - subscribe(events → WS push)                       ││
│  │  - customTools: [publish, manage_content, ...]       ││
│  │  - skills: [tingguo-weekly, github-trending, ...]    ││
│  │  - sessionManager: 每用户持久化 JSONL                ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```
