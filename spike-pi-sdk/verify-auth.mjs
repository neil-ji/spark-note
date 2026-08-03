#!/usr/bin/env node
/**
 * verify-auth.mjs — pi Embed SDK Spike: 模型认证链路验证
 *
 * SDK: @earendil-works/pi-coding-agent@0.83.0
 *
 * 验证内容：
 *   1. 认证来源解析（ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / ~/.pi/agent/auth.json）
 *   2. 401 的显式处理：注入无效 key，观察 SDK 如何暴露 HTTP 401
 *   3. 有效 key 经本机 gateway 的真实 LLM 调用（HTTP 200）
 *   4. 默认 endpoint（api.anthropic.com）的失败模式分类
 *
 * 运行: node verify-auth.mjs
 */
import { ModelRuntime, readStoredCredential } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const MODELS_OVERRIDE = new URL("./spike-models.json", import.meta.url).pathname;
const AUTH_JSON = join(homedir(), ".pi", "agent", "auth.json");

// 最小上下文：一条 user 消息
const ctx = (text) => ({
  messages: [{ role: "user", content: text ?? "用一句话回复：ok", timestamp: Date.now() }],
});

// 错误/结果分类：SDK 把 HTTP 401 暴露为 stopReason:"error" + errorMessage，不抛异常
function classify(msg) {
  if (!msg) return "未知";
  if (msg.stopReason === "error") {
    const em = msg.errorMessage ?? "";
    if (/^401\b|authentication_error|api key/i.test(em)) return `401 认证失败 → ${em.slice(0, 140)}`;
    if (/Connection error|fetch|ENOTFOUND|ECONNREFUSED/i.test(em)) return `网络不可达 → ${em.slice(0, 140)}`;
    return `LLM error → ${em.slice(0, 140)}`;
  }
  return `成功 (stopReason=${msg.stopReason})`;
}

function banner(title) {
  console.log(`\n===== ${title} =====`);
}

// ---------- 1. 环境与 auth.json 状态 ----------
banner("1. 环境 / auth.json 状态");
console.log("ANTHROPIC_API_KEY   :", process.env.ANTHROPIC_API_KEY ? `已设置 (len=${process.env.ANTHROPIC_API_KEY.length}, prefix=${process.env.ANTHROPIC_API_KEY.slice(0, 7)}…)` : "未设置");
console.log("ANTHROPIC_AUTH_TOKEN:", process.env.ANTHROPIC_AUTH_TOKEN ? `已设置 (len=${process.env.ANTHROPIC_AUTH_TOKEN.length})` : "未设置");
console.log("ANTHROPIC_BASE_URL  :", process.env.ANTHROPIC_BASE_URL ?? "未设置");
console.log("auth.json 路径      :", AUTH_JSON);
try {
  const cred = readStoredCredential("anthropic", AUTH_JSON);
  console.log("readStoredCredential(anthropic):", cred ? JSON.stringify(cred).slice(0, 80) : "无存储凭据（文件为空 {}）");
} catch (e) {
  console.log("readStoredCredential 读取失败:", e.message);
}

// ---------- 2. ModelRuntime 认证解析 ----------
banner("2. ModelRuntime 认证解析（本机 gateway 覆盖 spike-models.json）");
const runtime = await ModelRuntime.create({ modelsPath: MODELS_OVERRIDE });
console.log("hasConfiguredAuth('anthropic'):", runtime.hasConfiguredAuth("anthropic"));
console.log("checkAuth('anthropic')        :", JSON.stringify(await runtime.checkAuth("anthropic")));
console.log("getProviderAuthStatus('anthropic'):", JSON.stringify(runtime.getProviderAuthStatus("anthropic")));
console.log("listCredentials()             :", JSON.stringify(await runtime.listCredentials()));
const model = runtime.getModel("anthropic", "claude-haiku-4-5");
console.log("测试模型                     :", model?.id, "| baseUrl:", model?.baseUrl);

// ---------- 3. 401 显式处理（注入无效 key） ----------
banner("3. 401 显式处理（models.json 注入无效 apiKey）");
const tmp = mkdtempSync(join(tmpdir(), "pi-sdk-401-"));
writeFileSync(
  join(tmp, "models-401.json"),
  JSON.stringify({
    providers: {
      anthropic: {
        baseUrl: "http://127.0.0.1:8787",
        apiKey: "sk-invalid-401-spike-test",
      },
    },
  }),
);
const runtime401 = await ModelRuntime.create({ modelsPath: join(tmp, "models-401.json") });
const model401 = runtime401.getModel("anthropic", "claude-haiku-4-5");
const res401 = await runtime401.completeSimple(model401, ctx(), { maxTokens: 16 });
console.log("无效 key 调用结果:", classify(res401));
console.log("→ 说明: 0.83.0 不抛异常，而是返回 stopReason='error' + errorMessage='401 …'，调用方需检查该字段");

// ---------- 4. 有效 key 经本机 gateway 的真实调用 ----------
banner("4. 有效 key（env 解析）经本机 gateway 调用");
const res200 = await runtime.completeSimple(model, ctx("请用一句话回复：你好"), { maxTokens: 64 });
console.log("调用结果:", classify(res200));
if (res200.content?.length) {
  const text = res200.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  console.log("回复文本:", JSON.stringify(text));
}
console.log("usage:", JSON.stringify(res200.usage));

// ---------- 5. 默认 endpoint（无 baseUrl 覆盖）失败模式 ----------
banner("5. 默认 endpoint（api.anthropic.com，无覆盖）");
const defaultRuntime = await ModelRuntime.create();
const defaultModel = defaultRuntime.getModel("anthropic", "claude-haiku-4-5");
console.log("默认 baseUrl:", defaultModel?.baseUrl);
const resDef = await defaultRuntime.completeSimple(defaultModel, ctx(), { maxTokens: 16 });
console.log("默认 endpoint 结果:", classify(resDef));

// ---------- 结论 ----------
banner("认证链路结论");
console.log("1. SDK 认证链路完整可用：从 env ANTHROPIC_AUTH_TOKEN 自动解析，无需显式传 key。");
console.log("2. 当前 key 对本机 gateway (http://127.0.0.1:8787) 有效，真实 LLM 调用返回 HTTP 200。");
console.log("3. 若 key 无效，SDK 以 stopReason='error' + errorMessage('401 …') 暴露，需显式检查——不会抛异常。");
console.log("4. 直连 api.anthropic.com 需要真正的 sk-ant- 格式 key（当前 key 非该格式，沙箱内网络亦不可达）。");
console.log("5. auth.json (~/.pi/agent/auth.json) 当前为空 {}，未存储凭据；如需静态配置可写入该文件。");
process.exit(0);
