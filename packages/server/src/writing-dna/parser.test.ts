import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWritingDna, resolveTitle } from './parser.js';
import { extractChecklist } from './checklist.js';

test('解析标题 / 引用 / 段落', () => {
  const blocks = parseWritingDna('# 标题\n\n> 引用内容\n\n一段正文，带 `code`。');
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ['heading', 'quote', 'paragraph'],
  );
  assert.equal(blocks[0].kind === 'heading' && blocks[0].level, 1);
  assert.equal(blocks[0].kind === 'heading' && blocks[0].text, '标题');
  assert.equal(blocks[1].kind === 'quote' && blocks[1].text, '引用内容');
  assert.equal(blocks[2].kind === 'paragraph' && blocks[2].text, '一段正文，带 `code`。');
});

test('解析有序与无序列表', () => {
  const blocks = parseWritingDna('## 规则\n\n1. 第一条;2. 第二条\n- 甲\n- 乙\n');
  const ordered = blocks.find((b) => b.kind === 'list' && b.ordered) as Extract<typeof blocks[0], { kind: 'list' }> | undefined;
  const unordered = blocks.find((b) => b.kind === 'list' && !b.ordered) as Extract<typeof blocks[0], { kind: 'list' }> | undefined;
  assert.deepEqual(ordered?.items, ['第一条;2. 第二条']);
  assert.deepEqual(unordered?.items, ['甲', '乙']);
});

test('解析代码块，含内容中出现带标注围栏行的边界', () => {
  const markdown = '```js\nconst a = 1;\n```语言 代码块(示例)\n```\n';
  const blocks = parseWritingDna(markdown);
  const code = blocks[0];
  assert.equal(code.kind, 'code');
  assert.equal(code.lang, 'js');
  // 内容中的 ```语言... 行应保留在代码块内，闭合围栏是最后一行纯 ```
  assert.equal(code.code, 'const a = 1;\n```语言 代码块(示例)');
});

test('解析表格', () => {
  const markdown = '| 文体 | 模板 |\n|---|---|\n| 算法题解 | 题目链接 |\n| 概念讲解 | 前置知识 |\n';
  const blocks = parseWritingDna(markdown);
  assert.equal(blocks.length, 1);
  const table = blocks[0];
  assert.equal(table.kind, 'table');
  if (table.kind === 'table') {
    assert.deepEqual(table.headers, ['文体', '模板']);
    assert.deepEqual(table.rows, [
      ['算法题解', '题目链接'],
      ['概念讲解', '前置知识'],
    ]);
  }
});

test('resolveTitle 取首个一级标题', () => {
  const blocks = parseWritingDna('# Writing-DNA(Neil 技术笔记体)\n\n正文');
  assert.equal(resolveTitle(blocks, 'Writing-DNA.md'), 'Writing-DNA(Neil 技术笔记体)');
});

test('extractChecklist 从 Writing-DNA 结构提取核心规则与负面约束', () => {
  const markdown = [
    '# Writing-DNA',
    '',
    '## 核心规则(可执行)',
    '',
    '1. **条目分号收尾**:列表条目以全角";"收尾',
    '2. **"X:"定义式引导**:术语定义固定"X:全称(English)…;"格式',
    '',
    '## 负面约束(去"AI 腔")',
    '',
    '- ❌ 不用表格、不用"综上所述"式总结段',
    '- ❌ 不用排比抒情',
  ].join('\n');

  const groups = extractChecklist(parseWritingDna(markdown));
  assert.equal(groups.length, 2);

  const core = groups.find((g) => g.id === 'core');
  const negative = groups.find((g) => g.id === 'negative');
  assert.ok(core, '应提取到核心规则');
  assert.ok(negative, '应提取到负面约束');
  assert.equal(core?.items.length, 2);
  assert.equal(core?.items[0].id, 'core-1');
  assert.ok(core!.items[0].text.includes('条目分号收尾'));
  assert.equal(negative?.items[1].id, 'negative-2');
  assert.ok(negative!.items[1].text.includes('排比抒情'));
});

test('extractChecklist 对没有规则标题的文档返回空', () => {
  const groups = extractChecklist(parseWritingDna('# 语言DNA\n\n## 高频词\n\n- 就是/也就是(68)'));
  assert.equal(groups.length, 0);
});
