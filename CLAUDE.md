# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the content output repository for Neil's **《听过》(Tingguo)** series — an AI科普 (AI literacy) weekly newsletter published on Xiaohongshu (小红书). Content is produced as HTML card decks (5 cards per issue), screenshotted to PNGs, and accompanied by plain-text manuscripts.

The repo is content-only. There is no build system, no tests, no application code — just content files, shared brand CSS, and automation scripts for screenshot generation.

## Content pipeline

Every issue follows a 4-step pipeline defined in `.claude/skills/tingguo-weekly/SKILL.md`:

1. **选题** (topic selection + issue numbering)
2. **manuscript.txt** — human-authored plain text, no Markdown. The primary artifact.
3. **index.html** — branded HTML card deck derived from the manuscript. References `../brand.css`.
4. **PNG screenshots** — generated from the HTML via Playwright.

**The manuscript is always the first artifact.** HTML is derived from it, not the other way around.

## Directory conventions

```
content/
  听过/                          # 《听过》 series
    brand.css                    # Shared stylesheet for ALL issues — update once, re-screenshot all
    YYYY-MM-DD-issue-0X/         # Per-issue directory
      manuscript.txt             # Plain-text manuscript (can post directly to Xiaohongshu)
      index.html                 # Branded HTML card deck (5 cards: cover + 4 content pages)
      pngs/
        cover.png                # Card 1: cover
        card-02.png ~ card-05.png # Cards 2–5: content pages
        full.png                 # Full-page scroll capture
  其他/                           # Non-听过 content (e.g., one-off Xiaohongshu posts)
    <topic-slug>/
      index.html
      pngs/
```

## brand.css architecture

`content/听过/brand.css` is the single source of truth for the 听过 visual identity. Every issue's `index.html` links to it via `<link rel="stylesheet" href="../brand.css">`. Issue HTML files contain **only content and component selection** — no inline styles beyond what's needed for that specific issue.

The CSS provides a component catalog that each issue composes from: `c-insight`, `c-compare`, `c-hl`, `c-formula`, `c-finding`, `c-bullet-row`, `c-takeaway`, `c-tag-strip`, `c-next`, `c-cta`. Each has `--brand` (warm terracotta `#c1664b`) and `--teal` (`#4a8c7c`) color variants.

## Claude Skills

Three project skills live in `.claude/skills/`:

- **github-trending** — Fetch GitHub trending repositories via the free OSS Insight API. Invoke when the user says "GitHub trending", "热门项目", or "最近有什么好项目". Serves as the upstream intelligence source for content topic selection.
- **tingguo-weekly** — Full pipeline for producing a 听过 issue. Invoke when the user says "听过第X期", "写周刊", or "产出听过".
- **write-xiaohongshu** — General Xiaohongshu content writing. Invoke when the user says "小红书", "写一篇发布", or "XHS".

## Screenshot generation

```bash
# Generate PNGs from an issue's HTML card deck
node .claude/skills/tingguo-weekly/tools/screenshot.mjs \
  content/听过/YYYY-MM-DD-issue-0X/index.html \
  content/听过/YYYY-MM-DD-issue-0X/pngs

# Fallback: extract plain text from HTML (use only if manuscript.txt is lost)
node .claude/skills/tingguo-weekly/tools/extract-text.mjs \
  content/听过/YYYY-MM-DD-issue-0X/index.html \
  content/听过/YYYY-MM-DD-issue-0X/manuscript-recovered.txt
```

The screenshot tool requires Playwright. It auto-discovers playwright from a parent `node_modules/.pnpm` store (assuming `pnpm install` was run in the spark-hub monorepo).
