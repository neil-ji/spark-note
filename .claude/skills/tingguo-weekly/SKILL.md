---
name: tingguo-weekly
description: 产出《听过》周刊。完整的卡片式内容制作流水线：选题 → 纯文稿件 → 听过品牌 HTML 卡片 → 独立 PNG 截图。用户说「听过第X期」「写过周刊」「产出听过」时使用。
---

# 听过周刊写作流水线

产出《听过》系列周刊的完整流程。每期交付 6 个文件（1 文稿 + 1 HTML + 5 张卡片 PNG + 1 全页 PNG），按日期-期号归档。

工具脚本位于本目录 `tools/` 下。

## 品牌定位

《听过》是 Neil 的小红书 AI 科普系列：

- **定位**：介于严肃底层原理与轻松知识科普之间
- **口号**：你可以不深究其理，但应当「听过」
- **阅读时长**：约 5 分钟 / 期
- **读者**：非 AI 从业者，对技术有兴趣但不想深究细节
- **频率**：每周一期
- **署名**：关注我，AI 落地，眼见为实～

## 内容风格（关键）

### 文风对标第一期

```
这是我第一个小红书系列长文的第一篇、第二次技术内容创作尝试——《听过》，
介于严肃底层原理与轻松知识科普之间，你可以不深究其理，但应当「听过」。

用尽可能少的技术词汇，分享 AI 技术资讯，让非 AI 从业者有机会了解行业知识，
信息密度我会努力控制在 5 分钟读完的水平。
```

### 文风锚点（防漂移，每期生成后逐一自检）

以下锚点从第一期和第二期实际文本中提取。偏离任一锚点 = 文风漂移，需修正。

#### 句式节奏：长→短→长→短，交替呼吸

```
// ✅ 正确节奏（第二期原文）：
你大概率用过 ChatGPT 或 Claude：你问一句，它答一句，像发微信。    // 短
这很直观，但也容易让人以为 AI 就是个更聪明的搜索引擎。               // 短
其实在过去一年，AI 领域最大的变化不是「回答更准了」，而是「AI 能自己动手做事了」。// 长

// ❌ 漂移：连续三句等长，无节奏变化
AI 技术的发展非常迅速，在过去一年中取得了巨大的进步。
其中最重要的变化是 AI 能够自主执行任务了。
这种能力被称为 AI Agent，是目前最热门的话题之一。
```

**规则：每 2-3 句必须有一句长句（20 字以上，含破折号或分句），其余短句（15 字以内）。**

#### 必用句式（从已发布两期中提取，优先使用）

| 模式 | 示例 | 用途 |
|------|------|------|
| 「你大概率…」 | 你大概率用过 ChatGPT | 从读者经验切入 |
| 「…，但…」 | 这很直观，但也容易让人以为… | 先认可再颠覆 |
| 「其实…不是…而是…」 | 其实最大的变化不是回答更准了，而是能自己动手了 | 纠正认知 |
| 「区别在哪？…」 | 区别在哪？Agent 能使用工具。 | 设问自答 |
| 「这里的「X」不是…是…」 | 这里的「工具」不是螺丝刀，是搜索引擎… | 先否定再定义 |
| 「XX 这个概念不是新词，十年前…」 | Agent 这个概念不是新词，十年前学术界就在讨论 | 历史纵深感 |
| 「如果说去年…那今年…」 | 如果说去年要学会提问，那今年要学会派活 | 年度递进 |
| 「下次有人聊到 XX，你不至于…而是能…——这就够了。」 | 下次有人聊到 AI Agent，你不至于问「什么是 Agent」… | 社交场景 → 收束 |
| 「XX 门槛比你想的低」 | 这事门槛比你想的低 | 破除畏惧 |
| 「五秒…五分钟…」 | 五秒钟说完这句话，它干了五分钟的活 | 数字对比强化 |

#### 必用词汇（禁止替换为同义词）

| Neil 用词 | 禁止替换为 |
|-----------|-----------|
| 门槛 | 难度、挑战 |
| 派活 | 分配任务、委派工作 |
| 靠谱 | 可靠、稳定 |
| 就够了 | 就可以了、就足够了 |
| 把…搬进脑子里 | 记住、理解 |
| 「听过」→「学过」→「用过」 | （这是系列核心概念链，不可改写） |
| 眼见为实 | 实践证明、结果说话 |

#### 标点规范

- **破折号**：用 `——`（两个全角破折号），不用 `—`、`--`、`---`
- **引号**：关键概念用 `「」`（直角引号），不用 `""`、`''`
- **冒号**：解释说明用 `：`（全角），不用 `:`
- **结尾 CTA 用** `～`：`关注我，AI 落地，眼见为实～`
- **禁止使用 Markdown 标记**：无 `**`、`##`、`- `

#### 段落架构（硬规则）

1. **2-3 句一段**。单句段落可偶尔用于强调，全篇不超过 2 处。
2. **禁止编号列表**。不用 `1.` `2.` `3.` 或 `- `。用自然段落递进。
3. **段间空一行**。无 `———` 分隔线。
4. **开篇第一段必须自我引用**：「这是我《听过》系列的第 X 期。上一期聊了…这期聊…」
5. **结尾三段固定**：点题金句 → 下期预告 → CTA + 话题标签

#### 比喻守则

- **一个概念只用一个比喻**。如 Agent = 助理，不要同时又说 Agent = 自动驾驶。
- **比喻必须来自日常生活**（图书管理员、助理、实习生、字典、USB 插头），不来自技术域。
- **先用比喻讲清楚，再给技术名**。「像一个图书管理员…这就是所谓的大语言模型。」

#### 自我检查清单（生成文稿后逐项勾验）

- [ ] 开篇第一句是否包含「这是我《听过》系列的第 X 期」？
- [ ] 是否至少有一个「我前阵子/最近 + 具体行为」的个人例子？
- [ ] 是否至少有一处「比喻→技术概念」的映射？
- [ ] 是否有长-短-长的句式交替？（不是连续等长句）
- [ ] 是否用了「就够了」「门槛」「派活」「靠谱」中的至少 3 个？
- [ ] 是否出现「听过」→「学过」→「用过」（或变体「听过」→「聊过」→「用过」）？
- [ ] 结尾是否是「听过，比学会更重要。」+ CTA + 话题标签？
- [ ] 是否**没有任何** Markdown 标记（`**`、`##`、`- `）？
- [ ] 是否**没有任何** AI 味过渡词（「综上所述」「在当今时代」「值得注意的是」）？
- [ ] 正文（不含标题和标签）是否在 900 字以内？
- [ ] 标题格式是否为《听过第X期》xxx，且总字数 ≤ 20 字（含前缀）？

**任何一项未通过 → 修改文稿，不进入 HTML 阶段。**

### 结构模板

每期正文遵循此结构：

```
1. 【系列定位一句话】这是我《听过》系列的第 X 期。上一期聊了…这期聊…

2. 【钩子】制造认知反差或提出具体场景。如：「你大概率用过 ChatGPT，你问一句它答一句…但 AI 不止会聊天。」

3. 【核心概念】（2-3 段）用比喻讲清楚本期话题。如：「传统 AI 聊天像图书管理员…AI Agent 像助理…」

4. 【真实例子】（1 段）分享一个自己用过/见过的具体案例。必须有细节，不能泛泛而谈。

5. 【为什么是现在/跟你有关系吗】（1-2 段）解释时效性，连接读者利益。

6. 【点题】用「听过」收尾。如：「下次有人聊到 XX，你不至于问『什么是 XX』，而是能接一句『你说的是…那种？』——这就够了。」

7. 【下期预告 + CTA + 话题标签】
```

## 产出流水线（文稿优先，HTML 在后）

**核心原则：manuscript.txt 是第一产物，手工编写；HTML 从文稿派生。**

### Step 1: 确定选题和期号

```
期号格式：第 X 期
目录命名：YYYY-MM-DD-issue-0X
  例：2026-07-26-issue-02

建议话题方向（持续更新）：
- AI 如何获取最新知识（第一期）
- AI Agent：当 AI 不止会聊天（第二期）
- MCP：AI 的「通用插头」（第三期预告）
- RAG 是什么：AI 如何读懂你的文件
- Token 和上下文窗口：AI 的「记忆力」
- Fine-tuning vs. Prompt：两种调教 AI 的方式
- 开源模型 vs. 闭源模型：你该用哪个
```

### Step 2: 撰写纯文稿件（先做这一步）

**手工编写**干净的人读文本，直接产出纯文字，**不使用 Markdown**。这是小红书发布的原始素材。

保存为：
```
content/听过/YYYY-MM-DD-issue-0X/manuscript.txt
```

稿件格式：
```
[标题]  — 格式：《听过第X期》xxx，总字数 ≤ 20 字（含前缀）
           例：《听过第二期》AI Agent：当 AI 不止会聊天（20 字）

[正文]  — 900 字以内（不含标题和标签），连续段落，空行分隔
  - 段落间用空行分隔（不是 `---`）
  - 强调词用「」引号，不用 `**`
  - 不使用 `- ` 列表，用自然换行
  - 不使用 `## ` 标题

[结尾 CTA]
  听过，比学会更重要。
  关注我，AI 落地，眼见为实～

[话题标签]  — 如 #AI科普 #AI Agent #听过系列
```

### Step 3: 生成《听过》品牌 HTML（从文稿派生）

**架构：CSS 抽离为共享品牌文件，每期 HTML 只写内容和组件选择。**

所有 CSS 在 `content/听过/brand.css` 中维护。每期 HTML 通过 `<link rel="stylesheet" href="../brand.css">` 引用。品牌升级只需改 `brand.css` 一处，所有历史 issue 重新截图即可更新。

#### 3.1 HTML 骨架

每期 `index.html` 的最小结构：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>听过 · 第X期 — 本期标题</title>
  <link rel="stylesheet" href="../brand.css">
</head>
<body>
<div class="deck">

  <!-- PAGE 1 — COVER（结构固定，替换内容即可） -->
  <div class="card cover">
    <div class="cover-blob cover-blob--a"></div>
    <div class="cover-blob cover-blob--b"></div>
    <div class="weekly-badge"><span class="wb-dot"></span>每周更新</div>
    <div class="cover-content">
      <div class="cover-issue">第 X 期 · YYYY.MM.DD</div>
      <div class="cover-wordmark">听过</div>
      <div class="cover-rule"></div>
      <h1>标题：<em>高亮词</em></h1>
      <p class="cover-sub">你可以不深究其理，但应当「听过」</p>
      <div class="cover-meta">
        <span><!-- 时钟 SVG -->约 5 分钟</span>
        <span><!-- 宝石 SVG -->原创思考</span>
      </div>
    </div>
  </div>

  <!-- PAGES 2–5 — 从组件目录自由选配 -->

</div>
</body>
</html>
```

#### 3.2 组件目录（从 brand.css 提供的组件中自由选配）

内容页（page 2–5）每个 `.card` 的必备骨架：

```html
<div class="card">
  <div class="weekly-badge"><span class="wb-dot"></span>听过 · 第X期</div>
  <div class="page-series-marker">章节名</div>
  <div class="page-header">
    <div class="page-kicker page-kicker--brand">   <!-- --brand 或 --teal 交替 -->
      <span class="kicker-dot kicker-dot--brand"></span>标签
    </div>
    <h2>页面标题</h2>
    <div class="sub">副标题（可选）</div>
  </div>
  <div class="page-body">
    <!-- 从这里选组件 -->
  </div>
  <div class="page-footer-dots">
    <span></span><span class="active"></span><span></span><span></span><span></span>
  </div>
</div>
```

可用组件一览（所有 CSS 已在 brand.css 中，直接用 class）：

| 组件 | class | 用途 | 用法 |
|------|-------|------|------|
| 洞察框 | `c-insight` + `--brand`/`--teal` | 核心观点高亮 | 内含 `c-insight-label` + `<p>` |
| 左右对比 | `c-compare` | A vs B 两栏比较 | 两栏 `c-compare-col` + 中间 `c-compare-div` |
| 金句引用 | `c-hl` + 可选 `--t`(teal) | 一句话强调 | `<p><em>金句</em> 解释</p>` |
| 流程公式 | `c-formula` | 过程/公式展示 | `term` + `op`(→) + `result`，term 可用 `--t` 变 teal |
| 发现卡片 | `c-finding` | 案例/结果展示 | `c-finding-icon` + `c-finding-text` |
| 要点行 | `c-bullet-row` | 关键点列表 | `c-bullet` + 文本 |
| 结论卡 | `c-takeaway` | 编号结论 | `c-takeaway-num` + `<h3>` + `<p>`，支持 3 色 |
| 标签组 | `c-tag-strip` | 末尾关键词 | 内含 `c-tag` |
| 下期预告 | `c-next` | 虚线框预告 | `<strong>下期预告：</strong>...` |
| CTA 页脚 | `c-cta` | 关注引导 | `<strong>关注我…</strong>` + `.tagline` |

**组件搭配原则：**
- 每页 2–4 个组件，不超过 5 个（保持视觉不拥挤）
- brand 色（赭石）和 teal 色（青）交替用于相邻页面，避免连续两页同色
- 最后一页（page 5）固定结构：`c-takeaway` × 3 + `c-tag-strip` + `c-next` + `c-cta`
- 如果某期内容不适合 5 页标准结构，可以调整页数（4–6 页均可），但封面和总结页必须有

#### 3.3 封面硬规则（不可变）

- `.cover-wordmark` 始终是 `"听过"` 二字（不是标题）
- 封面 subtitle 始终包含「你可以不深究其理，但应当「听过」」
- 封面 meta 始终：「约 5 分钟」+ 「原创思考」
- `.weekly-badge` 封面用「每周更新」，内容页用「听过 · 第X期」

#### 3.4 参考实现

第二期 HTML 是内容优先模板的完整示例（277 行纯内容，无 CSS）：

```
content/听过/2026-07-26-issue-02/index.html
```

全部 CSS 在此：

```
content/听过/brand.css
```

### Step 4: 生成 PNG 截图

```bash
# 从项目根目录运行
node .claude/skills/tingguo-weekly/tools/screenshot.mjs \
  content/听过/YYYY-MM-DD-issue-0X/index.html \
  content/听过/YYYY-MM-DD-issue-0X/pngs
```

输出 6 个文件：
```
pngs/
  cover.png       # 封面卡片
  card-02.png     # 第 2 页
  card-03.png     # 第 3 页
  card-04.png     # 第 4 页
  card-05.png     # 第 5 页
  full.png        # 全页长截图
```

## 交付物清单

每期完成时，确认以下文件全部存在：

```
content/听过/YYYY-MM-DD-issue-0X/
  ├── manuscript.txt      # 纯文稿件（可直发小红书）
  ├── index.html          # 听过品牌 5 卡片 HTML
  └── pngs/
      ├── cover.png       # 封面卡片截图
      ├── card-02.png     # 内容页 2
      ├── card-03.png     # 内容页 3
      ├── card-04.png     # 内容页 4
      ├── card-05.png     # 内容页 5
      └── full.png        # 全页长截图
```

## 工具脚本

位于 `tools/` 子目录，可从项目根目录直接调用：

```bash
# HTML → 独立卡片 PNG（cover.png + card-02~05.png + full.png）
node .claude/skills/tingguo-weekly/tools/screenshot.mjs <html-file> <output-dir>

# HTML → 纯文稿件（应急恢复用，不如手工文稿干净）
node .claude/skills/tingguo-weekly/tools/extract-text.mjs <html-file> [output-file]
```

前提：项目需要安装 playwright（`npm install playwright` 或 `pnpm install`）。
