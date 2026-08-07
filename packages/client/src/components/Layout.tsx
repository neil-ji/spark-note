import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { HealthBadge } from './HealthBadge';
import SettingsModal from './SettingsModal';
import { IconBookOpen, IconDna, IconMessageSquare, IconMic, IconSettings } from './icons';

const navItems = [
  { to: '/chat', label: '对话', Icon: IconMessageSquare },
  { to: '/content', label: '内容管理', Icon: IconBookOpen },
  { to: '/writing-dna', label: 'Writing DNA', Icon: IconDna },
];

export default function Layout() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const backgroundRef = useRef<HTMLDivElement>(null);

  // P2-2：弹窗打开时把背景（header/main/footer）设为 inert + aria-hidden，
  // 阻止读屏/焦点/滚动触及背景；关闭时恢复。（React 18 类型无 inert 属性，用 ref 赋值。）
  useEffect(() => {
    if (backgroundRef.current) backgroundRef.current.inert = settingsOpen;
  }, [settingsOpen]);

  return (
    <div className="flex min-h-screen flex-col">
      <div ref={backgroundRef} aria-hidden={settingsOpen} className="flex min-h-screen flex-1 flex-col">
        <header className="border-b border-neutral-200 bg-white">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <IconMic className="h-5 w-5" />
              <span className="text-sm font-semibold">spark-note</span>
            </div>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-neutral-900 text-white'
                        : 'text-neutral-600 hover:bg-neutral-100'
                    }`
                  }
                >
                  <span className="mr-1 inline-flex items-center" aria-hidden>
                    <item.Icon className="h-4 w-4" />
                  </span>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <HealthBadge />
              <button
                onClick={() => setSettingsOpen(true)}
                className="rounded-md px-2 py-1.5 text-lg transition-colors hover:bg-neutral-100"
                aria-label="Provider / Model 设置"
                title="Provider / Model 设置"
              >
                <IconSettings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          <Outlet />
        </main>
        <footer className="border-t border-neutral-200 bg-white py-3 text-center text-xs text-neutral-400">
          spark-note · 单用户 · React + Vite + Fastify
        </footer>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
