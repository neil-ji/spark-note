#!/usr/bin/env node
/**
 * verify-websocket.mjs — pi Embed SDK Spike: WebSocket 事件转发验证
 *
 * SDK: @earendil-works/pi-coding-agent@0.83.0 | ws@8.21.1
 *
 * 验证内容：
 *   1. 用 ws 库搭最小 WebSocket 服务器
 *   2. 客户端连接后，服务器创建 AgentSession 并订阅事件
 *   3. 会话事件经 WebSocket 转发到客户端（真实 LLM 流式事件）
 *   4. 客户端收到 text_delta 并拼接完整文本
 *
 * 运行: node verify-websocket.mjs
 */
import { createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import { WebSocketServer, WebSocket } from "ws";

const MODELS_OVERRIDE = new URL("./spike-models.json", import.meta.url).pathname;
const PORT = 37641;
const PROMPT = "用一句话介绍你自己（不超过40字）";

const modelRuntime = await ModelRuntime.create({ modelsPath: MODELS_OVERRIDE });
const model = modelRuntime.getModel("anthropic", "claude-haiku-4-5");

// ---------- 服务器：转发 session 事件到 ws ----------
const wss = new WebSocketServer({ port: PORT, host: "127.0.0.1" });
console.log(`[server] ws://127.0.0.1:${PORT} 已监听`);

wss.on("connection", async (ws) => {
  console.log("[server] 客户端已连接");
  const { session } = await createAgentSession({
    model,
    thinkingLevel: "off",
    modelRuntime,
    sessionManager: SessionManager.inMemory(),
    tools: [],
  });

  const lifecycle = new Set(["agent_start", "turn_start", "message_start", "message_end", "turn_end", "agent_end", "agent_settled"]);
  let forwarded = 0;

  session.subscribe((event) => {
    let payload;
    if (event.type === "message_update") {
      const e = event.assistantMessageEvent;
      if (e?.type === "text_delta") {
        payload = { type: "text_delta", delta: e.delta };
      } else if (e?.type === "thinking_delta") {
        payload = { type: "thinking_delta", delta: e.delta };
      }
    } else if (lifecycle.has(event.type)) {
      payload = { type: event.type };
    }
    if (payload) {
      forwarded++;
      ws.send(JSON.stringify(payload));
    }
  });

  try {
    await session.prompt(PROMPT, { streamingBehavior: "followUp" });
  } catch (e) {
    ws.send(JSON.stringify({ type: "error", message: e.message }));
  }
  console.log(`[server] 转发完成，共 ${forwarded} 个事件；等待客户端确认后关闭`);
  ws.close();
  session.dispose();
});

wss.on("error", (e) => {
  console.error("[server] error:", e.message);
  process.exit(1);
});

// ---------- 客户端：接收并拼装 ----------
const client = new WebSocket(`ws://127.0.0.1:${PORT}`);
let text = "";
const eventSeq = [];
let gotError = null;

client.on("open", () => console.log("[client] 已连接服务器"));
client.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === "text_delta") {
    text += msg.delta;
    process.stdout.write(msg.delta);
  } else if (msg.type === "error") {
    gotError = msg.message;
  } else {
    eventSeq.push(msg.type);
  }
});
client.on("close", () => {
  console.log("\n\n===== WebSocket 验证结果 =====");
  console.log("收到事件序列:", eventSeq.join(" → "));
  console.log("text_delta 拼接:", JSON.stringify(text));
  console.log("流式文本长度:", text.length, "字符");
  console.log("错误:", gotError ?? "无");
  const pass = text.length > 0 && eventSeq.includes("agent_settled") && !gotError;
  console.log("验证结论:", pass ? "✅ 通过 —— 会话事件经 WebSocket 完整转发" : "❌ 失败");
  wss.close();
  process.exit(pass ? 0 : 1);
});

// 兜底超时
setTimeout(() => {
  console.error("\n[client] 超时：10s 内未完成");
  wss.close();
  process.exit(1);
}, 10000).unref();
