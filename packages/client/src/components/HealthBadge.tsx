import { useEffect, useState } from 'react';
import { getHealth } from '../lib/api';

type HealthState = 'loading' | 'ok' | 'error';

const styleByState: Record<HealthState, string> = {
  loading: 'bg-neutral-100 text-neutral-500',
  ok: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
};

const dotByState: Record<HealthState, string> = {
  loading: 'bg-neutral-400',
  ok: 'bg-emerald-500',
  error: 'bg-red-500',
};

const labelByState: Record<HealthState, string> = {
  loading: '检测中…',
  ok: 'API ok',
  error: 'API 异常',
};

/**
 * 后端健康检查指示器：挂载时及每 15s 调用一次 /api/health。
 * 该组件就是「前端页可调用后端健康检查接口返回 ok」这一验收点的直接体现。
 */
export function HealthBadge() {
  const [state, setState] = useState<HealthState>('loading');

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      getHealth()
        .then((data) => {
          if (!cancelled) setState(data.status === 'ok' ? 'ok' : 'error');
        })
        .catch(() => {
          if (!cancelled) setState('error');
        });

    check();
    const timer = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styleByState[state]}`}
      title="后端健康检查 GET /api/health"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotByState[state]}`} />
      {labelByState[state]}
    </span>
  );
}
