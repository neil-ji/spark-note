import { useEffect, useState, type ReactNode } from 'react';
import {
  getWritingDna,
  listWritingDna,
  type ChecklistGroup,
  type DnaBlock,
  type DnaDocDetail,
  type DnaDocMeta,
} from '../lib/api';

/** 规则对照清单勾选状态：按规则稳定 id 持久化到 localStorage。 */
const CHECKLIST_STORAGE_KEY = 'spark-note.writing-dna.checked';

/** 主文档（唯一带规则对照清单的文档）。 */
const MASTER_SLUG = 'Writing-DNA';

function loadChecked(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/* ---------------------------------------------------------------- */
/* 行内渲染：`` `code` `` 与 **bold**（不引入额外依赖，自写轻量 tokenizer） */
/* ---------------------------------------------------------------- */

function InlineText({ text }: { text: string }) {
  return <>{tokenizeInline(text)}</>;
}

function tokenizeInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // 先切 code 段（奇数下标为 `code`）
  const codeParts = text.split(/`([^`]*)`/g);
  codeParts.forEach((part, i) => {
    if (i % 2 === 1) {
      nodes.push(
        <code
          key={`c-${i}`}
          className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.85em] text-rose-700"
        >
          {part}
        </code>,
      );
    } else if (part) {
      nodes.push(...tokenizeBold(part, i));
    }
  });
  return nodes;
}

function tokenizeBold(text: string, seed: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  // 再切 **加粗** 段（奇数下标为加粗）
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      nodes.push(
        <strong key={`b-${seed}-${i}`} className="font-semibold text-neutral-900">
          {part}
        </strong>,
      );
    } else if (part) {
      nodes.push(part);
    }
  });
  return nodes;
}

/* ---------------------------------------------------------------- */
/* 结构化块渲染：heading / paragraph / quote / list / code / table */
/* ---------------------------------------------------------------- */

function BlockView({ block }: { block: DnaBlock }) {
  switch (block.kind) {
    case 'heading': {
      const levelStyles: Record<number, string> = {
        1: 'text-xl font-bold text-neutral-900',
        2: 'mt-8 text-lg font-semibold text-neutral-900',
        3: 'mt-6 text-base font-semibold text-neutral-900',
      };
      const cls = levelStyles[block.level] ?? 'mt-4 text-sm font-semibold text-neutral-900';
      return <h2 className={cls}>{block.text}</h2>;
    }

    case 'paragraph':
      return (
        <p className="mt-3 text-sm leading-7 text-neutral-700">
          <InlineText text={block.text} />
        </p>
      );

    case 'quote':
      return (
        <blockquote className="mt-3 border-l-4 border-neutral-300 bg-neutral-100/70 px-4 py-2.5 text-sm leading-6 text-neutral-600">
          <InlineText text={block.text} />
        </blockquote>
      );

    case 'list':
      return block.ordered ? (
        <ol className="mt-3 space-y-1.5 text-sm leading-6 text-neutral-700">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 font-mono text-xs leading-6 text-neutral-400">{i + 1}.</span>
              <span>
                <InlineText text={item} />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm leading-6 text-neutral-700">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-300" />
              <span>
                <InlineText text={item} />
              </span>
            </li>
          ))}
        </ul>
      );

    case 'code':
      return (
        <div className="mt-3 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
          {block.lang && (
            <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-800/60 px-3 py-1.5 font-mono text-[11px] text-neutral-400">
              <span className="text-emerald-400">$</span>
              {block.lang}
            </div>
          )}
          <pre className="overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-6 text-neutral-100">
            <code>{block.code}</code>
          </pre>
        </div>
      );

    case 'table':
      return (
        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-100">
                {block.headers.map((h, i) => (
                  <th key={i} className="border-b border-neutral-200 px-3 py-2 text-left font-semibold text-neutral-800">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="even:bg-neutral-50">
                  {row.map((cell, ci) => (
                    <td key={ci} className="border-b border-neutral-200 px-3 py-2 align-top text-neutral-700">
                      <InlineText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return null;
  }
}

/* ---------------------------------------------------------------- */
/* 规则对照清单面板 */
/* ---------------------------------------------------------------- */

function ChecklistPanel({
  groups,
  checked,
  onToggle,
  onReset,
}: {
  groups: ChecklistGroup[];
  checked: Record<string, boolean>;
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const done = groups.reduce((n, g) => n + g.items.filter((it) => checked[it.id]).length, 0);
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
            <span aria-hidden>✅</span> 规则对照清单
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {done}/{total}
            </span>
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            写作前 / 写后逐条自检，勾选进度保存在本机浏览器
          </p>
        </div>
        <button
          onClick={onReset}
          disabled={done === 0}
          className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 disabled:opacity-40"
        >
          清除勾选
        </button>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {groups.map((group) => {
          const groupDone = group.items.filter((it) => checked[it.id]).length;
          return (
            <div key={group.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-neutral-800">{group.label}</h4>
                <span className="text-xs text-neutral-400">
                  {groupDone}/{group.items.length}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {group.items.map((item) => {
                  const isChecked = Boolean(checked[item.id]);
                  return (
                    <li key={item.id}>
                      <label className="group flex cursor-pointer items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggle(item.id)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
                        />
                        <span
                          className={`text-[13px] leading-5 ${
                            isChecked ? 'text-neutral-400 line-through' : 'text-neutral-700'
                          }`}
                        >
                          <InlineText text={item.text} />
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* 页面 */
/* ---------------------------------------------------------------- */

export default function WritingDnaPage() {
  const [docs, setDocs] = useState<DnaDocMeta[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(MASTER_SLUG);
  const [doc, setDoc] = useState<DnaDocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>(loadChecked);

  // 一次性加载文档列表
  useEffect(() => {
    let cancelled = false;
    listWritingDna()
      .then(({ docs }) => {
        if (cancelled) return;
        setDocs(docs);
        // 默认选中主文档，不存在则回退到第一个
        setActiveSlug((prev) => (prev && docs.some((d) => d.slug === prev) ? prev : docs[0]?.slug ?? null));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 加载当前选中文档
  useEffect(() => {
    if (!activeSlug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getWritingDna(activeSlug)
      .then(({ doc }) => {
        if (!cancelled) setDoc(doc);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSlug]);

  const toggleChecked = (id: string) => {
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 存储不可用时静默降级（勾选仅本次会话生效）
      }
      return next;
    });
  };

  const resetChecked = () => {
    setChecked({});
    try {
      localStorage.removeItem(CHECKLIST_STORAGE_KEY);
    } catch {
      // 忽略
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Writing DNA</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          将 .claude/writing-dna/ 文档渲染为可读的写作风格结构，并提供写作自检的规则对照清单
        </p>
      </div>

      {/* 文档切换 */}
      <nav className="flex flex-wrap items-center gap-2">
        {docs.length === 0 && !loading && !error && (
          <span className="text-sm text-neutral-400">暂无 DNA 文档</span>
        )}
        {docs.map((d) => {
          const isActive = d.slug === activeSlug;
          return (
            <button
              key={d.slug}
              onClick={() => setActiveSlug(d.slug)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100'
              }`}
              title={d.fileName}
            >
              {d.title}
              {d.slug === MASTER_SLUG && (
                <span className="ml-1.5 text-[10px] font-normal opacity-70">主</span>
              )}
            </button>
          );
        })}
      </nav>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-medium">加载失败：</span>
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-lg bg-neutral-200/70" />
          <div className="h-64 animate-pulse rounded-lg bg-neutral-200/50" />
        </div>
      )}

      {doc && (
        <>
          {doc.checklist && doc.checklist.length > 0 && (
            <ChecklistPanel
              groups={doc.checklist}
              checked={checked}
              onToggle={toggleChecked}
              onReset={resetChecked}
            />
          )}

          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
                <span aria-hidden>🧬</span> 结构化渲染
              </h3>
              <span className="font-mono text-xs text-neutral-400">
                {doc.fileName} · {doc.blocks.length} 块
              </span>
            </div>
            {!doc.checklist || doc.checklist.length === 0 ? (
              <p className="mt-2 text-xs text-neutral-400">
                分文档展示（规则对照清单以主文档 Writing-DNA.md 为准）
              </p>
            ) : null}
            <div className="mt-2">
              {doc.blocks.map((block, i) => (
                <BlockView key={i} block={block} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
