# pi 与 MCP 兼容性结论及桥接方案

> **调研日期**: 2026-08-03  
> **信息来源**: https://pi.dev/docs/latest（全部页面）、https://github.com/earendil-works/pi-mono（源码搜索）

---

## 1. 官方立场：pi 不原生支持 MCP

### 1.1 证据

1. **文档全站搜索**：pi.dev/docs/latest 的 26 个页面中，**没有任何页面提及 MCP**（Model Context Protocol）。所有关键词搜索（MCP、model context protocol、mcp-server、mcp-client）均无结果。

2. **源码搜索**：GitHub `earendil-works/pi-mono` 仓库中未发现 MCP 相关代码、类型定义或集成模块。

3. **架构定位**：pi 的扩展系统（Extensions + Skills）在设计上覆盖了 MCP 的核心场景（工具提供、能力发现、按需加载），形成了一个**自成一体的替代方案**，而非 MCP 的实现。

### 1.2 官方替代方案

pi 通过以下机制实现了 MCP 类似的功能：

| MCP 概念 | pi 等价物 | 说明 |
|----------|----------|------|
| MCP Server → Tools | `pi.registerTool()` / Extensions | 注册 LLM 可调用的工具 |
| MCP Resources | Skills + `references/` 目录 | 按需加载的参考文档 |
| MCP Prompts | Prompt Templates | 可复用的提示模板 |
| MCP 能力发现 | 启动时自动扫描 + `resources_discover` 事件 | 技能/工具自动注册 |
| MCP 传输层 | 同进程调用 / RPC JSONL | 无独立传输层 |

---

## 2. 三条可落地桥接路径

### 2.1 方案 A：扩展层桥接（Extensions Bridge）⭐ 推荐

**原理**：编写一个 pi Extension，在 `session_start` 时连接 MCP server，将其 tools 动态注册为 pi 自定义工具。

**置信度**：**高** (85%)——pi SDK 的 `registerTool` API 与 MCP tool schema 存在天然的语义映射，技术上可行。

**架构**：

```
┌─────────────────────────────────────────────────┐
│  pi AgentSession                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  mcp-bridge extension                     │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │  MCP Client (stdio/SSE)              │  │  │
│  │  │  - list_tools() → pi.registerTool()  │  │  │
│  │  │  - call_tool() → MCP server          │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
│                      │                           │
│                      ▼                           │
│  ┌───────────────────────────────────────────┐  │
│  │  MCP Server (外部进程)                      │  │
│  │  - filesystem server                       │  │
│  │  - database server                         │  │
│  │  - web search server                       │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**实现示例**：

```typescript
// .pi/extensions/mcp-bridge/index.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export default function (pi: ExtensionAPI) {
  let mcpClient: Client | null = null;

  pi.on("session_start", async () => {
    // 1. 连接 MCP server
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["-y", "@anthropic/mcp-server-filesystem", "/path/to/data"],
    });

    mcpClient = new Client(
      { name: "pi-mcp-bridge", version: "1.0.0" },
      { capabilities: {} }
    );

    await mcpClient.connect(transport);

    // 2. 列出 MCP tools
    const { tools } = await mcpClient.listTools();

    // 3. 为每个 MCP tool 注册 pi 工具
    for (const mcpTool of tools) {
      // 将 JSON Schema 转换为 TypeBox schema
      const paramSchema = jsonSchemaToTypeBox(mcpTool.inputSchema);

      pi.registerTool({
        name: `mcp_${mcpTool.name}`,
        label: mcpTool.name,
        description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
        parameters: paramSchema,
        async execute(toolCallId, params, signal) {
          // 4. 调用 MCP tool
          const result = await mcpClient!.callTool({
            name: mcpTool.name,
            arguments: params as Record<string, unknown>,
          });

          // 5. 转换 MCP 响应为 pi 格式
          const text = result.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n");

          return {
            content: [{ type: "text", text }],
            details: { mcpResult: result },
          };
        },
      });
    }

    console.log(`[mcp-bridge] 已注册 ${tools.length} 个 MCP 工具`);
  });

  pi.on("session_shutdown", async () => {
    if (mcpClient) {
      await mcpClient.close();
      mcpClient = null;
    }
  });
}

// JSON Schema → TypeBox 的简化转换
function jsonSchemaToTypeBox(schema: any): any {
  if (!schema || !schema.properties) {
    return Type.Object({});
  }

  const properties: Record<string, any> = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    const p = prop as any;
    if (p.type === "string") {
      properties[key] = Type.String({ description: p.description });
    } else if (p.type === "number" || p.type === "integer") {
      properties[key] = Type.Number({ description: p.description });
    } else if (p.type === "boolean") {
      properties[key] = Type.Boolean({ description: p.description });
    } else if (p.type === "array") {
      properties[key] = Type.Array(Type.Any(), { description: p.description });
    } else {
      properties[key] = Type.Any({ description: p.description });
    }
  }

  return Type.Object(properties);
}
```

**注意**：上述实现是概念验证级代码。JSON Schema → TypeBox 的映射需要处理 `$ref`、`oneOf`、嵌套对象、`enum`（需映射为 `StringEnum`）等复杂情况。完整实现约 200–400 行。

### 2.2 方案 B：RPC 代理（RPC Proxy）

**原理**：在 RPC 模式下，由宿主进程作为 MCP client，将 MCP tools 通过 RPC 协议的 `bash` 命令或其他机制注入 pi。

**置信度**：**中** (60%)——可行但实现复杂，且增加了通信层级。

**架构**：

```
┌──────────────┐     RPC JSONL     ┌──────────────────┐     MCP      ┌─────────────┐
│  Host Process │ ◄──────────────► │  pi (RPC mode)   │             │  MCP Server │
│  (Node.js)    │                   │  (subprocess)    │             │             │
│               │  ┌─────────────┐  │                  │             │             │
│  MCP Client ──┼──┤ bridge logic├──┤  bash commands   │             │             │
│               │  └─────────────┘  │                  │             │             │
└──────────────┘                   └──────────────────┘             └─────────────┘
```

**限制**：
- RPC 的 `bash` 命令不经过 LLM 工具调用循环，需要额外处理
- MCP tool 的 schema 无法直接传递给 pi 的模型（因为工具注册在 pi 启动时已确定）
- 宿主进程需要手动将 MCP tool 结果注入到对话上下文中

### 2.3 方案 C：Provider 桥接（Provider Bridge）

**原理**：利用 pi 的 `registerProvider` API 和 `before_provider_request` 事件，在 provider 层面拦截请求，将 MCP 能力注入为"虚拟函数调用"（function calling）。

**置信度**：**低** (40%)——此方案高度投机，pi 的 provider API 设计用于模型适配而非工具注入。

**风险**：
- `before_provider_request` 允许修改 payload，但 pi 的工具调用格式（Anthropic tool_use / OpenAI function_call）与 MCP tool 格式不同
- 需要在 provider 层面解析和重写工具调用响应，属于协议级别的 hack
- 维护成本极高，pi 版本升级可能破坏

---

## 3. 对 spark-note web 端智能体的影响

### 3.1 必需 MCP 能力分析

spark-note 的内容运营场景中，哪些能力需要 MCP？

| 能力 | pi 原生支持 | 是否需要 MCP |
|------|:---:|:---:|
| 文件读写 | ✅ read/write/edit 内置工具 | 否 |
| Shell 命令执行 | ✅ bash 内置工具 | 否 |
| 内容搜索 | ✅ grep/find 内置工具 | 否 |
| GitHub API 调用 | ✅ bash 执行 curl / 或自定义工具 | 否 |
| 小红书发布（未来） | ⚠️ 需自定义工具 | 可选用 MCP |
| 外部数据源（数据库、API） | ⚠️ 需自定义工具 | 可选用 MCP |
| 跨服务编排（多 MCP server） | ❌ 需桥接 | 是（如果有） |

**结论**：spark-note 当前阶段的核心能力（文件操作、脚本执行、API 调用）pi 原生支持，**不需要 MCP**。未来若需接入外部 MCP server（如数据库查询、第三方内容 API），方案 A（扩展层桥接）是推荐路径。

### 3.2 建议策略

1. **第一阶段（现在）**：不引入 MCP。使用 pi 原生扩展 + 自定义工具覆盖所有需求
2. **第二阶段（需要时）**：当需要接入一个已有的 MCP server 时，实施方案 A 的扩展层桥接
3. **技术债预留**：在 web 后端架构中预留 MCP bridge 扩展的加载点（`additionalExtensionPaths` 配置）

---

## 4. 桥接方案对比

| 维度 | 方案 A: Extensions Bridge | 方案 B: RPC Proxy | 方案 C: Provider Bridge |
|------|:---:|:---:|:---:|
| **实现复杂度** | 中（200-400 行） | 高 | 高 |
| **类型安全** | 中（JSON Schema → TypeBox 映射） | 低 | 低 |
| **性能** | 好（同进程） | 中（额外序列化） | 好（同进程） |
| **维护成本** | 中 | 高 | 极高 |
| **MCP 协议完整性** | 高（使用官方 SDK） | 中 | 低 |
| **Tool schema 传递** | ✅ registerTool | ❌ 需手动转换 | ❌ 需 hack |
| **pi 版本升级风险** | 低（使用公开 API） | 中 | 高 |
| **置信度** | **高 (85%)** | 中 (60%) | 低 (40%) |

---

## 5. 最终结论

> **pi 不原生支持 MCP，且从文档和源码来看没有支持计划。**但这不是 blocker——pi 的扩展系统（Extensions + `registerTool` + Skills + Prompt Templates）已经覆盖了 MCP 在 spark-note 场景中的核心需求。

> **推荐路径**：优先使用 pi 原生扩展机制；当确实需要接入外部 MCP server 时，使用方案 A（扩展层桥接，置信度 85%）——通过 `@modelcontextprotocol/sdk` 连接 MCP server，将其 tools 动态注册为 pi 自定义工具。

> **Web 端一站式智能体的落地影响**：当前无影响。spark-note 的三个 SKILL（tingguo-weekly、github-trending、write-xiaohongshu）全部基于文件操作和 API 调用，pi 原生内置工具完全覆盖。未来扩展时按需引入 MCP bridge。

> **信息来源**：https://pi.dev/docs/latest（全部 26 个页面无 MCP 提及）、https://github.com/earendil-works/pi-mono（源码无 MCP 相关代码）——这两个来源的覆盖足以确认 pi 无 MCP 原生支持。
