import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
export function MessageList({ messages, isStreaming }) {
    const bottomRef = useRef(null);
    const containerRef = useRef(null);
    const userScrolledUp = useRef(false);
    // Auto-scroll to bottom on new content (unless user has scrolled up)
    useEffect(() => {
        const container = containerRef.current;
        if (!container)
            return;
        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            // Consider "at bottom" if within 80px of the bottom
            userScrolledUp.current = scrollHeight - scrollTop - clientHeight > 80;
        };
        container.addEventListener("scroll", handleScroll, { passive: true });
        return () => container.removeEventListener("scroll", handleScroll);
    }, []);
    useEffect(() => {
        if (!userScrolledUp.current) {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);
    if (messages.length === 0) {
        return (_jsx("div", { className: "flex-1 flex items-center justify-center p-8", children: _jsxs("div", { className: "text-center max-w-md", children: [_jsx("div", { className: "w-16 h-16 mx-auto mb-4 rounded-2xl bg-brand/10 flex items-center justify-center", children: _jsx("svg", { className: "w-8 h-8 text-brand", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5", stroke: "currentColor", strokeWidth: "1.5", fill: "none" }) }) }), _jsx("h2", { className: "text-lg font-semibold text-brand-text mb-2", children: "spark-note \u5185\u5BB9\u8FD0\u8425\u52A9\u624B" }), _jsx("p", { className: "text-sm text-brand-text-2 leading-relaxed", children: "\u6211\u53EF\u4EE5\u5E2E\u4F60\u4EA7\u51FA\u300A\u542C\u8FC7\u300B\u5468\u520A\u3001\u67E5\u770B GitHub Trending \u70ED\u70B9\u3001\u64B0\u5199\u5C0F\u7EA2\u4E66\u5185\u5BB9\u3002" }), _jsx("div", { className: "mt-4 flex flex-wrap justify-center gap-2", children: [
                            "写过听周刊第四期",
                            "查看 GitHub Trending",
                            "帮我写一篇小红书",
                        ].map((hint) => (_jsx("span", { className: "px-3 py-1.5 text-xs bg-brand-surface border border-brand-border\n                           rounded-full text-brand-text-2 cursor-default", children: hint }, hint))) })] }) }));
    }
    return (_jsxs("div", { ref: containerRef, className: "flex-1 overflow-y-auto px-4 py-6 space-y-1", children: [messages.map((msg) => (_jsx(MessageBubble, { message: msg }, msg.id))), _jsx("div", { ref: bottomRef })] }));
}
