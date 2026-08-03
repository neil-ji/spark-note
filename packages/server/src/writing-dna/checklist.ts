/**
 * 规则对照清单提取。
 *
 * 从解析后的 DNA 文档中，按标题关键字定位「规则类」小节，取其后的列表作为清单条目：
 *   - Writing-DNA.md 的 `## 核心规则(可执行)` → 10 条核心规则
 *   - Writing-DNA.md 的 `## 负面约束(去"AI 腔")` → 6 条负面约束
 *
 * 其他分文档没有这类标题，extractChecklist 返回空数组（页面只展示结构化渲染）。
 */

import type { DnaBlock } from './parser.js';

export interface RuleItem {
  /** 稳定 ID，用于前端 checkbox 勾选状态的 localStorage 持久化。 */
  id: string;
  text: string;
}

export interface ChecklistGroup {
  id: string;
  label: string;
  items: RuleItem[];
}

const GROUP_SPECS: ReadonlyArray<{ id: string; headingMatch: RegExp; label: string }> = [
  { id: 'core', headingMatch: /核心规则/, label: '核心规则（写作前 / 写后逐条对照）' },
  { id: 'negative', headingMatch: /负面约束/, label: '负面约束（去「AI 腔」）' },
];

/**
 * 从文档块中提取规则对照清单。每个 spec 命中一个标题后，向后寻找最近的列表块；
 * 若先遇到另一个标题（说明该小节没有列表）则跳过。
 */
export function extractChecklist(blocks: DnaBlock[]): ChecklistGroup[] {
  const groups: ChecklistGroup[] = [];

  for (const spec of GROUP_SPECS) {
    const headingIdx = blocks.findIndex(
      (b, i) => b.kind === 'heading' && spec.headingMatch.test(b.text),
    );
    if (headingIdx < 0) continue;

    for (let j = headingIdx + 1; j < blocks.length; j++) {
      const b = blocks[j];
      if (b.kind === 'list') {
        groups.push({
          id: spec.id,
          label: spec.label,
          items: b.items.map((text, k) => ({ id: `${spec.id}-${k + 1}`, text })),
        });
        break;
      }
      // 跳过引用/段落等过渡内容，直到列表或下一个标题
      if (b.kind === 'heading' || b.kind === 'code' || b.kind === 'table') break;
    }
  }

  return groups;
}
