import { NavLink, Outlet } from 'react-router-dom';
import { HealthBadge } from './HealthBadge';

const navItems = [
  { to: '/chat', label: '对话', icon: '💬' },
  { to: '/content', label: '内容管理', icon: '📚' },
  { to: '/writing-dna', label: 'Writing DNA', icon: '🧬' },
];

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              🎙️
            </span>
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
                <span className="mr-1" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <HealthBadge />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-neutral-200 bg-white py-3 text-center text-xs text-neutral-400">
        spark-note · 单用户 · React + Vite + Fastify
      </footer>
    </div>
  );
}
