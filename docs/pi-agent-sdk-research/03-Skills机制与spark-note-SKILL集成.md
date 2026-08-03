# pi Skills 机制与 spark-note SKILL 集成路径

> **调研日期**: 2026-08-03  
> **信息来源**: https://pi.dev/docs/latest/skills、https://agentskills.io/specification  
> **对照源**: `.claude/skills/tingguo-weekly/SKILL.md`、`github-trending/SKILL.md`、`write-xiaohongshu/SKILL.md`

---

## 1. pi Skills 机制核心要点

### 1.1 规范兼容性

pi 实现了 [Agent Skills 标准](https://agentskills.io/specification)，对多数违规仅警告但保持宽容。这意味着任何符合 Agent Skills 标准的 SKILL.md 都可以被 pi 加载。

### 1.2 SKILL.md 格式要求

```markdown
---
name: my-skill           # 必填：最长 64 字符，小写 a-z/0-9/连字符
description: ...         # 必填：最长 1024 字符，描述功能与使用时机
license: MIT             # 可选
compatibility: ...       # 可选：最长 500 字符，环境要求
metadata: {}             # 可选：任意键值映射
allowed-tools: read bash # 可选：预批准工具列表（实验性）
disable-model-invocation: false  # 可选：true 时仅通过 /skill:name 调用
---

# Skill 标题

## Setup
...

## Usage
...
```

**关键验证规则**：
- 缺少 `description` → **不加载**（唯一硬性失败）
- `name` 超长/非法字符/描述超长 → 警告但加载
- 名称冲突 → 警告并保留先找到的
- 未知 frontmatter 字段 → 忽略

### 1.3 加载位置（按优先级）

| 优先级 | 位置 | 说明 |
|--------|------|------|
| 1 | `~/.pi/agent/skills/` | 全局技能 |
| 2 | `~/.agents/skills/` | 全局技能（备用位置） |
| 3 | `.pi/skills/` | 项目技能（需项目受信任） |
| 4 | `.agents/skills/` | 项目技能（备用位置，向上查找至 git 根） |
| 5 | `settings.json` 的 `skills` 数组 | 自定义路径 |
| 6 | `--skill <path>` CLI 参数 | 临时加载（即使 `--no-skills` 也生效） |

### 1.4 触发方式

```
启动扫描 → 系统提示包含可用技能（XML 格式）→ Agent 匹配任务时 read SKILL.md → 按指令执行
```

也可通过 `/skill:name` 强制加载并执行，带参数如 `/skill:pdf-tools extract`。

**关键特性："渐进式披露"**——只有技能的 `description` 始终在系统提示中，完整指令按需由 agent 通过 `read` 工具加载。这避免了大量技能内容占用上下文窗口。

### 1.5 复用其他工具的 Skills

通过 settings.json 直接引入 Claude Code 或 OpenAI Codex 的技能目录：

```json
{
  "skills": ["~/.claude/skills", "~/.codex/skills"]
}
```

项目级 `.pi/settings.json`：

```json
{
  "skills": ["../.claude/skills"]
}
```

**这是 spark-note 现有 SKILL 接入 pi 的关键路径。**

---

## 2. spark-note 现有 SKILL 格式对照

### 2.1 tingguo-weekly

```yaml
# 现有 frontmatter（位于 .claude/skills/tingguo-weekly/SKILL.md）
name: tingguo-weekly
description: 产出《听过》周刊。完整的卡片式内容制作流水线：选题 → 纯文稿件 → 听过品牌 HTML 卡片 → 独立 PNG 截图。用户说「听过第X期」「写过周刊」「产出听过」时使用。
```

**pi 兼容性分析**：
- ✅ `name`：`tingguo-weekly` — 全小写+连字符，符合规范（最长 64 字符）
- ✅ `description`：详细描述了功能和使用时机（符合最长 1024 字符限制）
- ⚠️ 额外的 frontmatter 字段（如有）会被 pi 忽略，不影响加载
- ✅ 正文结构：Setup + Usage + 分步骤流水线指令 — 完全符合 Agent Skills 规范

### 2.2 github-trending

```yaml
name: github-trending
description: 获取 GitHub 近期热门项目资讯。发现社区趋势、技术热点、实用工具，支持内容创作选题和项目开发参考。用户说「GitHub trending」「热门项目」「最近有什么好项目」「趋势项目」「github hot」时使用。
```

**pi 兼容性分析**：
- ✅ `name`：符合规范
- ✅ `description`：详细描述了功能和多语言触发词
- ℹ️ 正文中包含 `tools/` 子目录下的脚本（`fetch-trending.mjs`），pi 中 agent 通过 `bash` 工具执行
- ⚠️ 引用了 `.claude/skills/github-trending/tools/` 路径 —— 需要确认 pi 加载后 `baseDir` 是否正确解析

### 2.3 write-xiaohongshu

```yaml
name: write-xiaohongshu
description: 通用小红书内容写作。产出一篇适合小红书发布的内容：纯文本稿件（无 Markdown）+ 可选的 HTML 卡片 + PNG 截图。适用于技术科普、产品介绍、经验分享等场景。用户提到「小红书」「写一篇发布」「XHS」时使用。
```

**pi 兼容性分析**：
- ✅ `name`：符合规范
- ✅ `description`：详细描述了交付物和触发条件
- ℹ️ 正文包含多个写作模板（问题-答案型/叙事型/清单型）—— 符合 Agent Skills 的指令体格式

---

## 3. 兼容性结论

### 3.1 格式层面：完全兼容 ✅

pi 遵循 Agent Skills 标准，而 spark-note 现有的 `SKILL.md` 文件结构与 Agent Skills 标准高度一致（YAML frontmatter + Markdown 指令正文），无需任何格式转换。

| 检查项 | tingguo-weekly | github-trending | write-xiaohongshu |
|--------|:---:|:---:|:---:|
| name 字段合法 | ✅ | ✅ | ✅ |
| description 字段存在 | ✅ | ✅ | ✅ |
| 正文为 Markdown 指令 | ✅ | ✅ | ✅ |
| 无非法 frontmatter | ✅ | ✅ | ✅ |
| 脚本路径使用相对路径 | ⚠️（需验证） | ⚠️（需验证） | ✅ |

### 3.2 加载方式：直接可用

**方案一（推荐）：通过 settings.json 引入**

在 `.pi/settings.json` 中配置：

```json
{
  "skills": ["../.claude/skills"]
}
```

pi 会扫描 `../.claude/skills/` 下的子目录，自动发现 `SKILL.md` 文件。

**方案二：复制到 pi 项目技能目录**

```bash
cp -R .claude/skills/* .pi/skills/
```

**方案三：通过 SDK 的 skillsOverride 注入**

```typescript
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import * as fs from "fs";
import * as path from "path";

const skillsDir = path.resolve(".claude/skills");

const loader = new DefaultResourceLoader({
  skillsOverride: (defaultSkills) => {
    // 扫描 .claude/skills/ 目录
    const customSkills = [];
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
        if (fs.existsSync(skillPath)) {
          // 解析 frontmatter
          const content = fs.readFileSync(skillPath, "utf-8");
          const match = content.match(/^---\n([\s\S]*?)\n---/);
          if (match) {
            const frontmatter: Record<string, string> = {};
            for (const line of match[1].split("\n")) {
              const [k, ...v] = line.split(":");
              if (k && v.length) frontmatter[k.trim()] = v.join(":").trim();
            }
            customSkills.push({
              name: frontmatter.name || entry.name,
              description: frontmatter.description || "",
              filePath: skillPath,
              baseDir: path.join(skillsDir, entry.name),
              source: "project",
            });
          }
        }
      }
    }
    return [...defaultSkills, ...customSkills];
  },
});

const { session } = await createAgentSession({ resourceLoader: loader });
```

### 3.3 触发方式：on-demand 兼容 ✅

在 pi 中，技能的触发方式与 spark-note 现有模式一致：
- Agent 根据 `description` 中的触发词自动匹配技能
- 用户可通过显式指令触发（如「听过第X期」「GitHub trending」）
- 可通过 `/skill:tingguo-weekly` 强制加载执行

---

## 4. 潜在差异与适配建议

### 4.1 脚本路径处理

**问题**：spark-note 技能中的脚本路径如 `node .claude/skills/tingguo-weekly/tools/screenshot.mjs`，在 pi 中 `cwd` 可能不同。

**方案**：在技能指令中使用相对路径（相对于技能目录的 `baseDir`）。pi 中的 agent 通过 `bash` 工具执行命令时，技能指令中的相对路径自动相对于技能目录解析：

```markdown
# 原指令
node .claude/skills/tingguo-weekly/tools/screenshot.mjs <html-file> <output-dir>

# 适配后（假设 baseDir 为技能根目录）
node tools/screenshot.mjs <html-file> <output-dir>
```

或在 skill 的 Setup 部分明确 cwd 要求。

### 4.2 allowed-tools 声明

pi 支持 `allowed-tools` frontmatter 字段（实验性），可预批准技能需要的工具，减少 agent 执行时的权限提示：

```yaml
---
name: tingguo-weekly
description: ...
allowed-tools: read bash write
---
```

对 web 场景特别有用——预批准的工具不会被阻塞等待用户授权。

### 4.3 disable-model-invocation

如果某些技能只想按需触发（不想让 agent 自动匹配），可设置：

```yaml
disable-model-invocation: true
```

此时技能仅通过 `/skill:name` 调用，不会出现在系统提示的可用技能列表中。

### 4.4 技能间联动

spark-note 的三个技能存在联动关系（github-trending → 选题 → tingguo-weekly/write-xiaohongshu）。在 pi 中，这种联动是通过 agent 自身的决策完成的：agent 在 github-trending 技能执行后，根据结果自动判断是否需要调用下游技能。

如果需要更精确的联动控制，可通过扩展实现：

```typescript
pi.registerCommand("full-pipeline", {
  description: "完整内容产出流水线：发现热点 → 选题 → 产出",
  handler: async (args, ctx) => {
    // 1. 先执行 github-trending
    await ctx.sendUserMessage("获取最近一周的 GitHub trending 并推荐听过选题");
    await ctx.waitForIdle();

    // 2. 根据结果继续
    await ctx.sendUserMessage("选择第一个选题，开始写过听周刊");
    await ctx.waitForIdle();
  },
});
```

---

## 5. 推荐集成方案

### 方案 A：零改动接入（推荐）

1. 在 spark-note 根目录创建 `.pi/settings.json`：
   ```json
   {
     "skills": ["../.claude/skills"]
   }
   ```

2. 三个技能自动被发现和加载，无需任何格式修改

3. Agent 根据 description 自动匹配技能

### 方案 B：pi-SDK 程序化注入（web 场景推荐）

在 web 后端中通过 SDK 的 `skillsOverride` 回调注入技能对象（代码见 3.2 方案三），完全控制技能加载逻辑，不依赖文件系统约定。

### 方案 C：作为 pi-package 分发

将三个技能打包为 pi package：

```
spark-note-skills/
├── package.json       # "pi": {"skills": ["./skills"]}
└── skills/
    ├── tingguo-weekly/
    │   ├── SKILL.md
    │   └── tools/
    ├── github-trending/
    │   ├── SKILL.md
    │   └── tools/
    └── write-xiaohongshu/
        ├── SKILL.md
        └── tools/
```

通过 `pi install ./spark-note-skills` 安装。

---

## 6. 总结

| 维度 | 评估 | 置信度 |
|------|------|--------|
| SKILL.md 格式兼容 | 完全兼容，无需修改 | **高** (Agent Skills 标准) |
| 加载方式 | 3 种方式均可行 | **高** (已验证文档) |
| on-demand 触发 | 与 spark-note 现有模式一致 | **高** |
| 脚本路径 | 需适配相对路径 | **中** (需实测验证) |
| 技能间联动 | agent 自动决策 + 扩展编排 | **中** |
| 迁移成本 | 极低（零改动或仅加一行 settings） | **高** |

**结论**：spark-note 现有 SKILL 在格式上完全兼容 pi，可通过 settings.json 一行配置接入，迁移成本极低。三个技能在 pi 中的触发方式与现有模式一致——agent 根据 description 自动匹配任务并加载完整指令。
