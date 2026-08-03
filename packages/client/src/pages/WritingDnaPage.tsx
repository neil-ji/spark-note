import { useEffect, useMemo, useState } from 'react';
import { getWritingDna, type DnaRule, type DnaDoc, type WritingDnaResponse } from '../lib/api';
import { Blocks, getOutline, parseBlocks } from '../lib/markdown';

/**
 * Writing DNA 可视化页：
 *   - 「写作风格文档」Tab：左侧分篇列表 + 右侧结构化渲染（标题层级/代码块/表格），
 *     附「本文结构」大纲可跳转；
 *   - 「核心规则自检」Tab：Writing-DNA.md 的 10 条核心规则，可展开详情、可勾选自查，
 *     勾选进度存 localStorage 持久化。
 *
 * 克制设计：只做结构化排版与自检清单，不做图谱/脑图等过度可视化。
 */

type Tab = 'docs' | 'rules';

const STORAGE_KEY = 'spark-note:writing-dna:checked';

function loadChecked(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(
      Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [],
    );
  } catch {
    return new Set();
  }
}

/** 文档展示顺序：整合文档 Writing-DNA.md 置顶，其余按文件名排序。 */
function orderDocs(docs: DnaDoc[]): DnaDoc[] {
  const priority = (slug: string) => (slug === 'Writing-DNA' ? 0 : 1);
  return [...docs].sort(
    (a, b) => priority(a.slug) - priority(b.slug) || a.name.localeCompare(b.name),
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-lg font-semibold">Writing DNA</h1>
      <p className="mt-0.5 text-sm text-neutral-500">
        将 .claude/writing-dna/ 下全部风格文档结构化渲染 · 附 10 条核心写作规则自检
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-neutral-900 bg-white text-neutral-900'
          : 'border-transparent text-neutral-500 hover:text-neutral-700'
      }`}
    >
      <span className="mr-1.5" aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  );
}

function DocSidebar({
  docs,
  activeSlug,
  onSelect,
}: {
  docs: DnaDoc[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
}) {
  return (
    <aside className="w-56 shrink-0">
      <div className="rounded-lg border border-neutral-200 bg-white p-1.5">
        <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
          写作风格文档
        </p>
        {docs.map((doc) => {
          const active = doc.slug === activeSlug;
          return (
            <button
              key={doc.slug}
              type="button"
              onClick={() => onSelect(doc.slug)}
              className={`block w-full rounded-md px-2 py-2 text-left transition-colors ${
                active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              <span className="block text-[13px] font-medium leading-5">{doc.title}</span>
              <span
                className={`block truncate font-mono text-[11px] ${
                  active ? 'text-neutral-400' : 'text-neutral-400'
                }`}
              >
                {doc.name}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function DocContent({ doc }: { doc: DnaDoc }) {
  const blocks = useMemo(() => parseBlocks(doc.raw), [doc.raw]);
  const outline = useMemo(() => getOutline(blocks), [blocks]);
  const sectionOutline = outline.filter((item) => item.level >= 2);

  return (
    <div className="min-w-0 flex-1">
      <article className="rounded-lg border border-neutral-200 bg-white p-5 sm:p-7">
        <Blocks blocks={blocks} className="dna-prose" />
      </article>
      {sectionOutline.length >= 2 ? (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
            本文结构
          </p>
          <nav className="space-y-1">
            {sectionOutline.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block text-[13px] leading-6 text-neutral-600 hover:text-teal-700"
                style={{ paddingLeft: `${(item.level - 2) * 12}px` }}
              >
                {item.text}
              </a>
            ))}
          </nav>
        </div>
      ) : null}
    </div>
  );
}

function RulesChecklist({
  rules,
  checked,
  onToggleChecked,
  onReset,
}: {
  rules: DnaRule[];
  checked: Set<number>;
  onToggleChecked: (index: number) => void;
  onReset: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const checkedCount = rules.filter((rule) => checked.has(rule.index)).length;
  const progress = rules.length ? (checkedCount / rules.length) * 100 : 0;

  const toggleExpanded = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="mt-5 max-w-2xl">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">写作前后自检清单</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500">
              {checkedCount}/{rules.length} 已完成
            </span>
            <button
              type="button"
              onClick={onReset}
              className="text-xs text-neutral-400 hover:text-neutral-700"
            >
              重置
            </button>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-full rounded-full bg-teal-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          来自 .claude/writing-dna/Writing-DNA.md「核心规则(可执行)」，写作前重读、写作后逐条勾选自查。
        </p>
      </div>

      <ol className="mt-3 space-y-2">
        {rules.map((rule) => {
          const isChecked = checked.has(rule.index);
          const isExpanded = expanded.has(rule.index);
          return (
            <li
              key={rule.index}
              className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
            >
              <div className="flex items-center gap-3 p-3">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleChecked(rule.index)}
                  className="h-4 w-4 shrink-0 accent-teal-700"
                  aria-label={`规则 ${rule.index}：${rule.title}`}
                />
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 font-mono text-xs font-medium text-neutral-500">
                  {rule.index}
                </span>
                <button
                  type="button"
                  onClick={() => toggleExpanded(rule.index)}
                  disabled={!rule.detail}
                  className={`min-w-0 flex-1 text-left text-sm font-medium leading-6 ${
                    isChecked ? 'text-neutral-400 line-through' : 'text-neutral-900'
                  } ${rule.detail ? 'hover:text-teal-700' : 'cursor-default'}`}
                  title={rule.detail ? '展开详情' : undefined}
                >
                  {rule.title}
                </button>
                {rule.detail ? (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(rule.index)}
                    aria-label={isExpanded ? '收起' : '展开'}
                    className="shrink-0 text-neutral-400 transition-transform hover:text-neutral-700"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
              {isExpanded && rule.detail ? (
                <div className="border-t border-neutral-100 px-4 py-3 pl-[3.25rem] text-[13px] leading-6 text-neutral-600">
                  {rule.detail}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function WritingDnaPage() {
  const [payload, setPayload] = useState<WritingDnaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('docs');
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<number>>(loadChecked);

  useEffect(() => {
    let cancelled = false;
    getWritingDna()
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        // 默认选中整合文档 Writing-DNA.md，其次第一份文档
        const ordered = orderDocs(data.docs);
        setActiveSlug(
          (prev) =>
            prev ??
            ordered.find((doc) => doc.slug === 'Writing-DNA')?.slug ??
            ordered[0]?.slug ??
            null,
        );
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 勾选进度持久化到 localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...checked]));
  }, [checked]);

  const activeDoc = useMemo(
    () => payload?.docs.find((doc) => doc.slug === activeSlug) ?? null,
    [payload, activeSlug],
  );
  const rules = payload?.rules ?? [];

  const toggleChecked = (index: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div>
      <PageHeader />

      <div className="mt-5 flex gap-1 border-b border-neutral-200">
        <TabButton
          active={tab === 'docs'}
          onClick={() => setTab('docs')}
          icon="📄"
          label="写作风格文档"
        />
        <TabButton
          active={tab === 'rules'}
          onClick={() => setTab('rules')}
          icon="✅"
          label={`核心规则自检${rules.length ? ` · ${rules.filter((r) => checked.has(r.index)).length}/${rules.length}` : ''}`}
        />
      </div>

      {loading ? (
        <div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">
          正在读取 .claude/writing-dna/ …
        </div>
      ) : null}

      {!loading && error ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm font-medium text-red-700">读取 Writing DNA 失败</p>
          <p className="mt-1 font-mono text-xs text-red-500">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-xs font-medium text-white hover:bg-neutral-700"
          >
            重试
          </button>
        </div>
      ) : null}

      {!loading && !error && (!payload || payload.docs.length === 0) ? (
        <div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">
          .claude/writing-dna/ 下暂无 Markdown 文档
        </div>
      ) : null}

      {!loading && !error && payload && payload.docs.length > 0 ? (
        tab === 'docs' ? (
          <div className="mt-5 flex flex-col gap-5 md:flex-row">
            <DocSidebar docs={orderDocs(payload.docs)} activeSlug={activeSlug} onSelect={setActiveSlug} />
            {activeDoc ? <DocContent doc={activeDoc} /> : null}
          </div>
        ) : (
          <RulesChecklist
            rules={rules}
            checked={checked}
            onToggleChecked={toggleChecked}
            onReset={() => setChecked(new Set())}
          />
        )
      ) : null}
    </div>
  );
}
