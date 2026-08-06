import { useEffect, useRef, useState } from 'react';

/**
 * 打字机流式文本 hook。
 *
 * 输入完整累积文本 text 与是否正在流式 active：
 * - active = true（实时流式）：用 requestAnimationFrame 逐帧递增 reveal，每帧最多
 *   推进 CHARS_PER_FRAME 个字符，直到追平完整文本；期间返回 showCursor=true，由
 *   调用方在文本末尾渲染块状光标。text 持续增长时动画不断追平，不会越界。
 * - active = false（流式结束 / abort / 历史回显）：直接揭示全文，无动画、无光标。
 * - 文本更新或组件卸载时取消进行中的 rAF，避免动画堆叠与泄漏。
 */
const CHARS_PER_FRAME = 2;

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

    // 实时流式：从当前 reveal 位置继续逐帧推进（text 变化会触发本 effect 重跑，
    // 闭包内始终是最新 text；先取消旧 rAF 再排下一帧，保证不堆叠）。
    countRef.current = Math.min(countRef.current, text.length);
    setDisplay(text.slice(0, countRef.current));

    const tick = () => {
      const next = Math.min(countRef.current + CHARS_PER_FRAME, text.length);
      countRef.current = next;
      setDisplay(text.slice(0, next));
      if (next < text.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
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
