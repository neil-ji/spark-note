#!/usr/bin/env node
/**
 * GitHub Trending — OSS Insight API 薄封装
 *
 * 调用 OSS Insight 公开 API 获取 Trending 仓库数据，输出 Markdown 或 JSON。
 * 零外部依赖，仅用 Node.js 内置模块。
 *
 * 用法:
 *   node fetch-trending.mjs                           # 本周全语言 Top 20
 *   node fetch-trending.mjs --period past_month       # 本月全语言
 *   node fetch-trending.mjs --language Python         # 本周 Python
 *   node fetch-trending.mjs --top 10 --json           # JSON 输出 Top 10
 *   node fetch-trending.mjs --period past_24_hours    # 24 小时热门
 *
 * OSS Insight API 文档: https://ossinsight.io/docs
 */

import https from "https";
import { URL } from "url";

// ---- 参数解析 ----
const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) {
    const key = args[i].slice(2);
    const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
    flags[key] = val;
  }
}

const period = flags.period || "past_week";
const language = flags.language || null;
const topN = parseInt(flags.top || "20", 10);
const asJson = !!flags.json;

// ---- API 请求 ----
function fetchTrending() {
  const apiUrl = new URL("https://api.ossinsight.io/v1/trends/repos/");
  apiUrl.searchParams.set("period", period);
  // 不加 language 参数 = 全语言

  // 如果指定了语言，OSS Insight 需要逐语言请求（API 限制）
  const languages = language ? [language] : [null];

  return Promise.all(
    languages.map((lang) => {
      const u = new URL(apiUrl);
      if (lang) u.searchParams.set("language", lang);
      return httpGet(u.toString());
    })
  );
}

function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    https
      .get(urlStr, { headers: { Accept: "application/json" } }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`JSON 解析失败: ${e.message}`));
          }
        });
      })
      .on("error", reject);
  });
}

// ---- 数据解析 ----
function parseRepos(responses) {
  const allRows = [];
  for (const resp of responses) {
    if (!resp?.data?.rows) continue;
    allRows.push(...resp.data.rows);
  }

  return allRows
    .map((row) => ({
      name: row.repo_name || "",
      language: row.primary_language || "",
      description: (row.description || "").slice(0, 120),
      stars: parseInt(row.stars, 10) || 0,
      forks: parseInt(row.forks, 10) || 0,
      prs: parseInt(row.pull_requests, 10) || 0,
      pushes: parseInt(row.pushes, 10) || 0,
      score: parseFloat(row.total_score) || 0,
      contributors: (row.contributor_logins || "")
        .split(",")
        .filter(Boolean)
        .slice(0, 3),
      collections: (row.collection_names || "")
        .split(",")
        .filter(Boolean),
      url: `https://github.com/${row.repo_name}`,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ---- 格式化输出 ----
const PERIOD_LABELS = {
  past_24_hours: "24 小时",
  past_week: "本周",
  past_month: "本月",
  past_28_days: "近 28 天",
};

function toMarkdown(repos) {
  const label = PERIOD_LABELS[period] || period;
  const langLabel = language ? ` ${language}` : "";
  let md = `## GitHub Trending — ${label}${langLabel} Top ${repos.length}\n\n`;
  md += `> 数据来源: OSS Insight | ${new Date().toISOString().slice(0, 10)}\n\n`;

  md += `| # | 仓库 | 语言 | Stars | Score | 描述 |\n`;
  md += `|---|------|------|------:|------:|------|\n`;

  repos.forEach((r, i) => {
    const desc = r.description || "-";
    md += `| ${i + 1} | [${r.name}](${r.url}) | ${r.language || "-"} | ${r.stars.toLocaleString()} | ${r.score.toFixed(0)} | ${desc} |\n`;
  });

  // 语言分布
  const langCounts = {};
  repos.forEach((r) => {
    if (r.language) langCounts[r.language] = (langCounts[r.language] || 0) + 1;
  });
  const topLangs = Object.entries(langCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  md += `\n### 语言分布\n\n`;
  topLangs.forEach(([lang, count]) => {
    const bar = "█".repeat(count);
    md += `- **${lang}**: ${bar} ${count}\n`;
  });

  // 收藏集（赛道热点）
  const collections = new Map();
  repos.forEach((r) => {
    r.collections.forEach((c) => {
      collections.set(c, (collections.get(c) || 0) + 1);
    });
  });
  if (collections.size > 0) {
    md += `\n### 热门赛道\n\n`;
    [...collections.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([col, count]) => {
        md += `- **${col}**: ${count} 个项目\n`;
      });
  }

  return md;
}

function toBrief(repos) {
  // 简洁文本格式，适合 Agent 快速扫描
  const label = PERIOD_LABELS[period] || period;
  let text = `## ${label} GitHub Trending Top ${repos.length}\n\n`;
  repos.forEach((r, i) => {
    const stars = `${(r.stars / 1000).toFixed(1)}k`.padStart(6);
    const desc = r.description ? ` — ${r.description}` : "";
    text += `${String(i + 1).padStart(2)}. ${stars} ⭐ [${r.name}](${r.url})${desc}\n`;
  });
  return text;
}

// ---- 主流程 ----
(async () => {
  try {
    const responses = await fetchTrending();
    const repos = parseRepos(responses);

    if (repos.length === 0) {
      console.log("未获取到 Trending 数据，请稍后重试。");
      process.exit(1);
    }

    if (asJson) {
      console.log(JSON.stringify(repos, null, 2));
    } else {
      console.log(toMarkdown(repos));
    }
  } catch (e) {
    console.error(`获取失败: ${e.message}`);
    console.error("提示: OSS Insight API 限流 600 req/hour/IP，请稍后重试。");
    process.exit(1);
  }
})();
