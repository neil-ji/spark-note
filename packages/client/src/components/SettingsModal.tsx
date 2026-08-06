import { useEffect, useState } from 'react';
import { getConfig, saveConfig, type ConfigResponse } from '../lib/api';

const THINKING_LEVELS = ['off', 'low', 'medium', 'high'] as const;

const SOURCE_LABEL: Record<string, string> = {
  env: '环境变量',
  file: '配置文件',
  default: '默认值',
};

const SOURCE_STYLE: Record<string, string> = {
  env: 'bg-sky-100 text-sky-700',
  file: 'bg-emerald-100 text-emerald-700',
  default: 'bg-neutral-100 text-neutral-500',
};

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Provider / Model 配置弹窗。
 *
 * 打开时从 GET /api/config 拉取当前生效配置（含每字段来源），编辑 model id /
 * thinking 级别 / baseUrl 后 PUT /api/config 落盘到 .pi/config.json。
 * 优先级 env > 配置文件 > 默认值；改动需重启后端生效，API key 不落盘。
 */
export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [modelId, setModelId] = useState('');
  const [thinkingLevel, setThinkingLevel] = useState('low');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // 每次打开时重新拉取服务端配置（保证来源说明与值一致）。
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setFeedback(null);
    getConfig()
      .then((cfg) => {
        setConfig(cfg);
        setModelId(cfg.modelId);
        setThinkingLevel(cfg.thinkingLevel);
        setBaseUrl(cfg.baseUrl ?? '');
      })
      .catch((err: unknown) => {
        setFeedback({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    const trimmedModel = modelId.trim();
    const trimmedBaseUrl = baseUrl.trim();
    if (!trimmedModel) {
      setFeedback({ kind: 'error', text: '模型 id 不能为空' });
      return;
    }
    if (trimmedBaseUrl && !/^https?:\/\//.test(trimmedBaseUrl)) {
      setFeedback({ kind: 'error', text: 'baseUrl 需以 http:// 或 https:// 开头' });
      return;
    }
    setSaving(true);
    try {
      const next = await saveConfig({
        modelId: trimmedModel,
        thinkingLevel,
        baseUrl: trimmedBaseUrl || null,
      });
      setConfig(next);
      setFeedback({
        kind: 'success',
        text: `已保存到 ${next.configPath ?? '.pi/config.json'}，重启后端后生效。`,
      });
    } catch (err) {
      setFeedback({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const srcBadge = (field: 'provider' | 'modelId' | 'thinkingLevel' | 'baseUrl') => {
    const kind = config?.source?.[field] ?? 'default';
    return (
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SOURCE_STYLE[kind]}`}>
        {SOURCE_LABEL[kind]}
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Provider / Model 配置"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Provider / Model 配置</h2>
          <button
            onClick={onClose}
            className="rounded px-2 text-neutral-400 hover:text-neutral-700"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-neutral-400">加载配置中…</p>
        ) : (
          <>
            {feedback && (
              <div
                className={`mb-3 rounded-lg px-3 py-2 text-xs ${
                  feedback.kind === 'success'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-600'
                }`}
              >
                {feedback.text}
              </div>
            )}

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 flex items-center gap-2 text-xs font-medium text-neutral-600">
                  Provider（只读）{srcBadge('provider')}
                </span>
                <input
                  value={config?.provider ?? 'anthropic'}
                  readOnly
                  disabled
                  className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
                />
              </label>

              <label className="block">
                <span className="mb-1 flex items-center gap-2 text-xs font-medium text-neutral-600">
                  模型 id {srcBadge('modelId')}
                </span>
                <input
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  placeholder="如 claude-haiku-4-5 / deepseek-chat"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500"
                />
              </label>

              <label className="block">
                <span className="mb-1 flex items-center gap-2 text-xs font-medium text-neutral-600">
                  Thinking 级别 {srcBadge('thinkingLevel')}
                </span>
                <select
                  value={thinkingLevel}
                  onChange={(e) => setThinkingLevel(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500"
                >
                  {THINKING_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 flex items-center gap-2 text-xs font-medium text-neutral-600">
                  Provider 端点（baseUrl）{srcBadge('baseUrl')}
                </span>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="留空使用官方端点"
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500"
                />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-[11px] leading-relaxed text-neutral-400">
                优先级：环境变量 &gt; .pi/config.json &gt; 默认值。配置改动需重启后端生效，API key 不落盘。
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:opacity-80 disabled:opacity-40"
                >
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
