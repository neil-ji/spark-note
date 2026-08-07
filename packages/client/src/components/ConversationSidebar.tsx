import { useState } from 'react';
import type { Conversation } from '../lib/api';
import { IconCheck, IconMessageSquare, IconPencil, IconPlus, IconSearch, IconTrash, IconX } from './icons';

/** 会话列表项的展示时间：刚刚 / N 分钟前 / N 小时前 / 月-日。 */
function formatTime(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  /** 窄屏（<md）下作为抽屉打开（父组件控制 true/false）。 */
  mobileOpen?: boolean;
  /** 抽屉关闭回调（点击遮罩 / 关闭按钮时触发）。 */
  onCloseMobile?: () => void;
}

/**
 * 会话侧栏：新建 / 历史列表（标题=首条消息或重命名名 + 时间）/ 切换 / 行内重命名 / 确认后删除。
 *
 * 窄屏（<md）下为抽屉：父组件传 mobileOpen 时以 fixed 定位覆盖显示 + 半透明遮罩；
 * md 及以上始终为静态侧栏。同一 <aside> 通过条件类在两形态间切换，不重复渲染 DOM。
 */
export default function ConversationSidebar({
  conversations,
  activeId,
  loading,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  mobileOpen = false,
  onCloseMobile,
}: ConversationSidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // 前端内存过滤：按 name / preview 不区分大小写子串匹配（后端 list 已全量，无需额外请求）。
  const query = search.trim().toLowerCase();
  const filteredConversations = query
    ? conversations.filter((c) => (c.name || c.preview || '').toLowerCase().includes(query))
    : conversations;

  const startRename = (c: Conversation) => {
    setRenamingId(c.id);
    setRenamingName(c.name || c.preview || '');
  };

  const commitRename = async (id: string) => {
    const name = renamingName.trim();
    setRenamingId(null);
    if (!name) return; // 空名称 → 取消（后端 PATCH 也拒绝空 name）
    try {
      await onRename(id, name);
    } catch {
      // 重命名失败静默保留原样
    }
  };

  const confirmDelete = async (id: string) => {
    setConfirmingId(null);
    try {
      await onDelete(id);
    } catch {
      // 删除失败静默保留原样
    }
  };

  const asideClass = mobileOpen
    ? 'fixed inset-y-0 left-0 z-50 w-72 rounded-none border-y-0 border-l-0 shadow-2xl md:static md:z-auto md:w-60 md:shrink-0 md:rounded-lg md:border md:shadow-none'
    : 'hidden w-60 shrink-0 md:flex';

  return (
    <>
      {/* 抽屉遮罩：仅窄屏抽屉打开时出现，点击关闭（点自身关闭按钮也走 onCloseMobile）。 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-neutral-900/40 md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        aria-label="会话列表"
        className={`flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white ${asideClass}`}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5">
          <span className="text-sm font-semibold text-neutral-800">会话</span>
          <div className="flex items-center gap-1">
            <button
              onClick={onCreate}
              title="新建会话"
              aria-label="新建会话"
              className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
            >
              <IconPlus className="h-4 w-4" />
            </button>
            {mobileOpen && (
              <button
                onClick={onCloseMobile}
                title="关闭会话列表"
                aria-label="关闭会话列表"
                className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 md:hidden"
              >
                <IconX className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* 搜索框：按 name/preview 前端内存过滤（无会话时隐藏，避免空输入框占位）。 */}
        {conversations.length > 0 && (
          <div className="border-b border-neutral-200 p-2">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索会话"
                aria-label="搜索会话"
                className="w-full rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-7 pr-2 text-xs text-neutral-800 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white"
              />
            </div>
          </div>
        )}

        <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {loading && conversations.length === 0 && (
            <div className="px-2 py-8 text-center text-xs text-neutral-400">加载中…</div>
          )}
          {!loading && conversations.length === 0 && (
            <div className="px-2 py-10 text-center">
              <IconMessageSquare className="mx-auto h-6 w-6 text-neutral-300" />
              <p className="mt-2 text-xs text-neutral-400">暂无会话</p>
            </div>
          )}
          {!loading && conversations.length > 0 && filteredConversations.length === 0 && (
            <div className="px-2 py-10 text-center">
              <IconSearch className="mx-auto h-6 w-6 text-neutral-300" />
              <p className="mt-2 text-xs text-neutral-400">无匹配会话</p>
            </div>
          )}

          {filteredConversations.map((c) => {
            const active = c.id === activeId;
            const isRenaming = renamingId === c.id;
            const isConfirming = confirmingId === c.id;
            const title = c.name || c.preview || '新会话';
            return (
              <div
                key={c.id}
                className={`group rounded-lg px-2 py-2 transition-colors ${
                  active ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                }`}
              >
                {isRenaming ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={renamingName}
                      onChange={(e) => setRenamingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRename(c.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      className="w-full min-w-0 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-xs outline-none focus:border-neutral-500"
                    />
                    <button
                      onClick={() => void commitRename(c.id)}
                      title="确认"
                      aria-label="确认重命名"
                      className="shrink-0 p-1 text-emerald-600 hover:text-emerald-700"
                    >
                      <IconCheck className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setRenamingId(null)}
                      title="取消"
                      aria-label="取消重命名"
                      className="shrink-0 p-1 text-neutral-400 hover:text-neutral-600"
                    >
                      <IconX className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : isConfirming ? (
                  <div className="flex items-center gap-1 text-xs text-neutral-600">
                    <span className="min-w-0 flex-1">删除该会话？</span>
                    <button
                      onClick={() => void confirmDelete(c.id)}
                      className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-600 transition-colors hover:bg-red-100"
                    >
                      删除
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      className="shrink-0 rounded px-1.5 py-0.5 text-neutral-500 transition-colors hover:bg-neutral-100"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button onClick={() => onSelect(c.id)} className="min-w-0 flex-1 text-left" title={title}>
                      <div className="truncate text-[13px] font-medium text-neutral-800">{title}</div>
                      <div className="mt-0.5 text-[11px] text-neutral-400">{formatTime(c.modified)}</div>
                    </button>
                    {/* 触屏无 hover：重命名/删除操作常显，避免不可发现 */}
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                      <button
                        onClick={() => startRename(c)}
                        title="重命名"
                        aria-label="重命名会话"
                        className="p-1 text-neutral-400 transition-colors hover:text-neutral-700"
                      >
                        <IconPencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setConfirmingId(c.id)}
                        title="删除"
                        aria-label="删除会话"
                        className="p-1 text-neutral-400 transition-colors hover:text-red-600"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
