---
name: github-trending
description: 获取 GitHub 近期热门项目资讯。发现社区趋势、技术热点、实用工具，支持内容创作选题和项目开发参考。用户说「GitHub trending」「热门项目」「最近有什么好项目」「趋势项目」「github hot」时使用。
---

# GitHub Trending 热点资讯

获取 GitHub 近期热门项目数据，分析技术趋势，为内容创作和项目开发提供情报。

工具脚本位于本目录 `tools/` 下。

## 定位

本 skill 是内容流水线的**上游资讯工具**：

```
github-trending (发现热点)
       ↓
  选题决策
       ↓
tingguo-weekly / write-xiaohongshu (产出内容)
```

不是一次性查询工具。可以根据用户意图提供三层递进的输出：
1. **快速概览** — 「看看最近有什么热门项目」
2. **深度分析** — 「这些项目反映了什么趋势」
3. **选题建议** — 「有哪些适合写过听周刊的话题」

## 数据获取

### 主力：OSS Insight API（免费，无需认证）

运行本目录下的薄封装脚本：

```bash
# 本周全语言 Trending Top 20（默认）
node .claude/skills/github-trending/tools/fetch-trending.mjs

# 本月 Top 10，JSON 格式
node .claude/skills/github-trending/tools/fetch-trending.mjs --period past_month --top 10 --json

# 24 小时热点
node .claude/skills/github-trending/tools/fetch-trending.mjs --period past_24_hours

# 特定语言
node .claude/skills/github-trending/tools/fetch-trending.mjs --language Rust --top 15
```

**可用参数：**

| 参数 | 可选值 | 默认 | 说明 |
|------|--------|------|------|
| `--period` | `past_24_hours`, `past_week`, `past_month`, `past_28_days` | `past_week` | 统计周期 |
| `--language` | `Python`, `TypeScript`, `Rust`, `Go` 等 | 全语言 | 语言过滤 |
| `--top` | 1–100 | `20` | 返回数量 |
| `--json` | - | 关闭 | 输出 JSON 而非 Markdown |

### 辅助：GitHub Search API（需要 Token 时可补充）

当需要按总 star 数发现「新星项目」时，可用 GitHub Search API 补充：

```bash
curl -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/search/repositories?q=created:>$(date -v-7d +%Y-%m-%d)+stars:>=100&sort=stars&order=desc&per_page=20"
```

**注意：** Search API 按总 star 排序，OSS Insight 按综合活跃度评分。两者发现的项目不同——Search API 找「横空出世的新项目」，OSS Insight 找「近期最活跃的项目」。

### 备用：Apify GitHub Trending Scraper（需要 Token）

如果配置了 Apify token，可直接抓取 `github.com/trending` 页面（数据完全等同官方 Trending）：

```bash
curl -X POST "https://api.apify.com/v2/acts/skootle~github-trending/run-sync-get-dataset-items?token=$APIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"periods":["weekly"],"languages":[],"maxItems":20}'
```

## 分析维度

拿到 Trending 数据后，Agent 应从以下维度分析，而非简单罗列仓库名：

### 1. 赛道识别

从项目和 collection_names 中识别热点技术方向：
- **AI/LLM 相关** — Agent、MCP、Gateway、RAG、Fine-tuning 等关键词
- **开发工具** — CLI、DevOps、部署平台、代码生成
- **基础设施** — 数据库、消息队列、网络框架
- **前端/设计** — UI 框架、设计工具、可视化
- **新语言/框架** — Rust 应用、Zig、Mojo 等

### 2. 信号强度判断

不是 star 越多越值得关注。结合以下信号判断：

| 信号 | 含义 |
|------|------|
| 低 star 高 score | 正在快速上升的新项目，值得早期关注 |
| 高 star 高 score | 成熟项目近期有新动态/爆发 |
| 大厂出品 | 百度、Andrew Ng、Block 等 — 有背书但未必持续 |
| 个人开发者高分 | 社区用脚投票，往往更实用 |
| 出现在 collection 中 | 已被 OSS Insight 归类到某个赛道 |

### 3. 内容选题判断（对听过周刊）

适合写过听周刊的热门项目特征：
- **概念新颖** — 普通人没听过但应该有概念的技术（如 AI Gateway、Agent Fleet）
- **有故事性** — 能从「问题 → 方案 → 效果」讲一个完整故事
- **可用比喻解释** — 能用生活化比喻讲清楚（适合听过风格）
- **与读者有关** — 影响普通用户使用 AI 的方式

不适合的特征：
- 纯基础设施（如新 ORM、编译器优化）
- 太 niche（如某个游戏的 mod 工具）
- 没有「听过」价值（大家都知道的东西）

## 输出模板

### 快速概览（用户说「看看最近有什么」）

```
## 本周 GitHub Trending 速览

[Markdown 表格，来自 fetch-trending.mjs 输出]

### 一句话趋势
本周热点集中在 [赛道A] 和 [赛道B]。[最值得关注的项目] 值得一看。

需要我深入分析某个方向吗？
```

### 深度分析（用户说「分析一下趋势」）

```
## GitHub Trending 趋势分析（[周期]）

### 🔥 热门赛道

**赛道 1: [名称]**
- [项目A] — 一句话说明，为什么值得关注
- [项目B] — 一句话说明
- 趋势解读：[1-2 句话讲清楚这个赛道在发生什么]

**赛道 2: [名称]**
...

### 💎 本周最值得关注

选出 3 个最值得关注的项目，给出理由：
1. **[项目名]** — 理由（与新概念/实用价值/增长信号相关）
2. ...
3. ...

### 📈 长期趋势观察

对比往期数据（如有），哪些方向在持续升温？
```

### 选题报告（用户说「找选题」或联动 tingguo-weekly）

```
## 听过周刊选题建议（基于本周 GitHub Trending）

### 推荐选题

**选题 1: [话题]**
- 素材项目：[GitHub 项目名]
- 听过角度：[用一句话说明如何讲给非 AI 从业者听]
- 比喻方案：[拟用的生活化比喻]
- 预计期号：第 X 期

**选题 2: [话题]**
...

### 备选话题
- [话题] — 热度够但需要等更多素材
- [话题] — 概念好但缺少好的比喻切入点

需要我开始写哪一期的文稿？
```

## 内容创作联动

当用户从 Trending 数据中选定选题后，可直接联动：

- **写过听周刊** → 触发 `tingguo-weekly` skill，按流水线产出完整 issue
- **写小红书单篇** → 触发 `write-xiaohongshu` skill，产出单篇图文
- **只做选题记录** → 在对应 issue 目录下创建选题笔记

联动时，Agent 应将 Trending 分析结果中的：
- 项目背景信息
- 核心概念解释
- 建议的比喻方案

作为上下文传递给下游 skill。

## 注意事项

- OSS Insight API 限流 600 req/hour，正常使用不会触及
- 数据可能有数小时延迟，不是实时的
- `total_score` 是综合评分（stars + PRs + pushes 等加权），比单纯 star 数更能反映热度
- 偶尔某些语言的高分项目很少，这是正常的——说明该语言社区近期相对安静
- 如果用户配置了 Apify token 或 GitHub token，优先使用以获取更丰富的数据

## 工具脚本

```bash
# Trending 数据获取（OSS Insight API）
node .claude/skills/github-trending/tools/fetch-trending.mjs [--period] [--language] [--top N] [--json]
```

零依赖，仅使用 Node.js 内置模块。
