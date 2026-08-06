import { useEffect, useState, type ReactNode } from 'react';
import { listContentIssues, type ContentIssue } from '../lib/api';

/** 内容类型徽章配色。 */
const BADGE_STYLES: Record<'manuscript' | 'html' | 'png', string> = {
  manuscript: 'bg-emerald-50 text-emerald-700',
  html: 'bg-sky-50 text-sky-700',
  png: 'bg-violet-50 text-violet-700',
};

function Badge({ kind, children }: { kind: 'manuscript' | 'html' | 'png'; children: ReactNode }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${BADGE_STYLES[kind]}`}>
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* 详情区：文稿 / HTML iframe / PNG 卡片预览 */
/* ---------------------------------------------------------------- */

function ManuscriptView({ issue }: { issue: ContentIssue }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
        <span aria-hidden>📝</span> 文稿
      </h3>
      <pre className="mt-3 whitespace-pre-wrap font-sans text-[13.5px] leading-7 text-neutral-700">
        {issue.manuscript}
      </pre>
    </section>
  );
}

function HtmlPreview({ issue }: { issue: ContentIssue }) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
        <h3 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
          <span aria-hidden>🌐</span> HTML 预览
        </h3>
        <a
          href={issue.htmlUrl ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-neutral-500 transition-colors hover:text-neutral-800"
        >
          新窗口打开 ↗
        </a>
      </div>
      <div className="h-[480px] overflow-hidden bg-neutral-100">
        <iframe
          src={issue.htmlUrl ?? undefined}
          title={`第 ${issue.number} 期 HTML 预览`}
          sandbox=""
          className="h-full w-full bg-white"
        />
      </div>
    </section>
  );
}

function PngGallery({ issue }: { issue: ContentIssue }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
        <span aria-hidden>🖼️</span> 卡片预览
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
          {issue.pngs.length} 张
        </span>
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {issue.pngUrls.map((url, i) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            title={issue.pngs[i]}
            className="group overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 transition-colors hover:border-neutral-400"
          >
            <img
              src={url}
              alt={`第 ${issue.number} 期卡片 ${i + 1}`}
              loading="lazy"
              className="h-auto w-full transition-opacity group-hover:opacity-90"
            />
          </a>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* 页面 */
/* ---------------------------------------------------------------- */

export default function ContentPage() {
  const [issues, setIssues] = useState<ContentIssue[]>([]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 一次性加载各期元信息（含文稿文本与 PNG 列表）
  useEffect(() => {
    let cancelled = false;
    listContentIssues()
      .then(({ issues: data }) => {
        if (cancelled) return;
        setIssues(data);
        // 默认选中第一期，已有选中则保持
        setActiveName((prev) => (prev && data.some((i) => i.name === prev) ? prev : data[0]?.name ?? null));
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

  const active = issues.find((i) => i.name === activeName) ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">内容管理</h1>
        <p className="mt-0.5 text-sm text-neutral-500">
          浏览 / 归档 / 新增 content/ 下的各期内容（文稿 · HTML · PNG 预览）
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-medium">加载失败：</span>
          {error}
          <span className="ml-2 text-red-500">请确认后端服务已启动</span>
        </div>
      )}

      {loading && (
        <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
          <div className="h-96 animate-pulse rounded-xl bg-neutral-200/60" />
          <div className="h-96 animate-pulse rounded-xl bg-neutral-200/40" />
        </div>
      )}

      {!loading && !error && issues.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-400">
          暂无已归档内容（content/听过/ 下未发现期目录）
        </div>
      )}

      {!loading && !error && issues.length > 0 && (
        <div className="grid items-start gap-5 lg:grid-cols-[240px_1fr]">
          {/* 期数列表 */}
          <aside className="overflow-hidden rounded-xl border border-neutral-200 bg-white lg:sticky lg:top-4">
            <div className="border-b border-neutral-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-neutral-900">《听过》周刊</h2>
              <p className="mt-0.5 text-xs text-neutral-500">共 {issues.length} 期</p>
            </div>
            <ul className="max-h-[62vh] divide-y divide-neutral-100 overflow-y-auto">
              {issues.map((issue) => {
                const isActive = issue.name === activeName;
                return (
                  <li key={issue.name}>
                    <button
                      onClick={() => setActiveName(issue.name)}
                      className={`flex w-full flex-col gap-1 border-l-2 px-4 py-3 text-left transition-colors ${
                        isActive
                          ? 'border-l-neutral-900 bg-neutral-50'
                          : 'border-l-transparent hover:bg-neutral-50'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-medium ${isActive ? 'text-neutral-900' : 'text-neutral-700'}`}
                        >
                          第 {issue.number} 期
                        </span>
                        <span className="shrink-0 font-mono text-xs text-neutral-400">{issue.date}</span>
                      </span>
                      {issue.title && (
                        <span className="truncate text-xs text-neutral-500">{issue.title}</span>
                      )}
                      <span className="flex items-center gap-1.5">
                        {issue.manuscript != null && <Badge kind="manuscript">文稿</Badge>}
                        {issue.hasHtml && <Badge kind="html">HTML</Badge>}
                        {issue.pngs.length > 0 && <Badge kind="png">PNG ×{issue.pngs.length}</Badge>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* 详情区 */}
          <div className="space-y-5">
            {active ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-neutral-900">
                      第 {active.number} 期
                      {active.title && (
                        <span className="ml-2 font-normal text-neutral-500">· {active.title}</span>
                      )}
                    </h2>
                    <p className="mt-0.5 font-mono text-xs text-neutral-400">{active.name}</p>
                  </div>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
                    {active.date}
                  </span>
                </div>

                {active.manuscript != null && <ManuscriptView issue={active} />}
                {active.hasHtml && active.htmlUrl && <HtmlPreview issue={active} />}
                {active.pngs.length > 0 && <PngGallery issue={active} />}
              </>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white text-sm text-neutral-400">
                选择一期查看详情
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
