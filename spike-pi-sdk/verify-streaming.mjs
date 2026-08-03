#!/usr/bin/env node
/**
 * verify-streaming.mjs — pi Embed SDK Spike: 流式事件订阅验证
 *
 * SDK: @earendil-works/pi-coding-agent@0.83.0
 *
 * 验证内容：
 *   1. createAgentSession + session.subscribe + session.prompt 最小链路
 *   2. text_delta 流式事件可被订阅捕获（真实 LLM 输出，经本机 gateway）
 *   3. 完整事件循环序列（agent_start → … → agent_settled）
 *   4. prompt() 不传 streamingBehavior 也可调用（空闲状态）
 *
 * 运行: node verify-streaming.mjs
 */
import { createAgentSession, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";

const MODELS_OVERRIDE = new URL("./spike-models.json", import.meta.url).pathname;

const modelRuntime = await ModelRuntime.create({ modelsPath: MODELS_OVERRIDE });
const model = modelRuntime.getModel("anthropic", "claude-haiku-4-5");
console.log(`模型: ${model?.id} | baseUrl: ${model?.baseUrl}\n`);

const { session } = await createAgentSession({
  model,
  thinkingLevel: "off", // 关闭思考，直接观测 text_delta
  modelRuntime,
  sessionManager: SessionManager.inMemory(),
  tools: [],
});

// 事件统计
const eventSeq = [];
const roundText = []; // 每轮 text_delta 拼接
let currentText = "";
let think = "";
const deltaKinds = new Set();

session.subscribe((event) => {
  eventSeq.push(event.type);
  if (event.type === "message_update") {
    const e = event.assistantMessageEvent;
    if (e?.type === "text_delta") {
      deltaKinds.add("text_delta");
      currentText += e.delta;
      process.stdout.write(e.delta);
    } else if (e?.type === "thinking_delta") {
      deltaKinds.add("thinking_delta");
      think += e.delta;
    } else if (e?.type) {
      deltaKinds.add(e.type);
    }
  }
  // 一轮结束：归档文本，开启新累积
  if (event.type === "agent_settled") {
    roundText.push(currentText);
    currentText = "";
  }
});

try {
  console.log(">>> 第 1 轮 prompt（带 streamingBehavior: followUp）");
  await session.prompt("用一句话介绍什么是大型语言模型（不超过40字）", { streamingBehavior: "followUp" });
  console.log("\n>>> 第 2 轮 prompt（不传 streamingBehavior——空闲状态应正常）");
  await session.prompt("刚才的答案是英文还是中文？回答一个字：中或英", {});
} catch (e) {
  console.log("\nPROMPT ERROR:", e.message);
}

console.log("\n\n===== 验证结果 =====");
console.log("事件总数:", eventSeq.length);
console.log("事件序列:", eventSeq.join(" → "));
console.log("捕获的 delta 类型:", [...deltaKinds].join(", "));
roundText.forEach((t, i) => console.log(`第 ${i + 1} 轮 text_delta 拼接:`, JSON.stringify(t)));
if (think) console.log("thinking_delta 拼接:", JSON.stringify(think));
console.log("会话状态: isStreaming =", session.isStreaming, "| isIdle =", session.isIdle);
console.log("session.state.messages 条数:", session.state.messages.length);
session.dispose();
process.exit(0);
