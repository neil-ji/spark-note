import { useEffect, useRef, useState } from 'react';

/**
 * 打字机流式文本 hook。
 *
 * 输入完整累积文本 text 与是否正在流式 active：
 * - active = true（实时流式）：用 requestAnimationFrame 逐帧递增 reveal，text 持续增长时
 *   只把已消费计数钳位、不直接刷新 display——高频 text_delta 被合并到下一帧 rAF 统一渲染
 *   （避免事件频率下逐条重解析整个 markdown）。短文本按 BASE_CHARS_PER_FRAME 匀速浮现；
 *   长文本按目标总时长压缩逐帧批大小，把 reveal 帧数约束在常量级，使整篇解析成本随文本
 *   长度近似线性（避免 O(n²)），同时长文本不会长时间停在打字机状态。
 * - active = false（流式结束 / abort / 历史回显）：直接揭示全文，无动画、无光标。
 * - 文本更新或组件卸载时取消进行中的 rAF，避免动画堆叠与泄漏。
 */
const BASE_CHARS_PER_FRAME = 2;
/** 长文本整体浮现的目标时长上限（毫秒）：超长文本按此提速，限制 reveal 帧数与解析总成本。 */
const MAX_REVEAL_MS = 5000;
const MAX_FRAMES = Math.ceil(MAX_REVEAL_MS * (60 / 1000));

/** 本帧应推进的字符数：剩余较短时用基准速率，剩余很长时放大批大小使总帧数受 MAX_FRAMES 约束。 */
function charsPerFrame(remaining: number): number {
  return Math.max(BASE_CHARS_PER_FRAME, Math.ceil(remaining / MAX_FRAMES));
}

export function useTypewriter(text: string, active: boolean): { display: string; showCursor: boolean } {
  // 非流式（历史回显 / 已完成消息）挂载时直接以全文初始化，避免首帧空文本闪烁。
  const [display, setDisplay] = useState(() => (active ? '' : text));
  const countRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      // 流式结束 / abort / 历史回显：全文停驻，光标消失。
      countRef.current = text.length;
      setDisplay(text);
      return;
    }

    // 实时流式：countRef 钳位到当前文本长度即可，display 交给下一帧 rAF 统一推进。
    countRef.current = Math.min(countRef.current, text.length);

    const tick = () => {
      const remaining = text.length - countRef.current;
      if (remaining <= 0) {
        // 已追平：不再排帧，等下一次 text 增长触发本 effect 重跑。
        rafRef.current = null;
        return;
      }
      const next = Math.min(countRef.current + charsPerFrame(remaining), text.length);
      countRef.current = next;
      setDisplay(text.slice(0, next));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active, text]);

  const showCursor = active && display.length > 0;

  return { display, showCursor };
}
