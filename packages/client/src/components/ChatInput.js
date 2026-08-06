import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useCallback } from "react";
export function ChatInput({ onSend, onAbort, isStreaming, isConnected, disabled, }) {
    const [text, setText] = useState("");
    const textareaRef = useRef(null);
    const handleSend = useCallback(() => {
        const trimmed = text.trim();
        if (!trimmed || isStreaming || disabled)
            return;
        onSend(trimmed);
        setText("");
        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    }, [text, isStreaming, disabled, onSend]);
    const handleKeyDown = useCallback((e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);
    const handleInput = useCallback(() => {
        const el = textareaRef.current;
        if (!el)
            return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }, []);
    return (_jsxs("div", { className: "border-t border-brand-border bg-brand-surface p-4", children: [_jsxs("div", { className: "flex items-end gap-3 max-w-3xl mx-auto", children: [_jsx("textarea", { ref: textareaRef, value: text, onChange: (e) => setText(e.target.value), onKeyDown: handleKeyDown, onInput: handleInput, placeholder: !isConnected
                            ? "正在连接服务器…"
                            : isStreaming
                                ? "Agent 正在运行…"
                                : "输入消息，例如：写过听周刊第四期…", disabled: isStreaming || disabled || !isConnected, rows: 1, className: "flex-1 resize-none rounded-xl border border-brand-border bg-white px-4 py-3\n                     text-sm text-brand-text placeholder-brand-text-3\n                     focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand\n                     disabled:bg-gray-50 disabled:cursor-not-allowed\n                     min-h-[44px] max-h-[200px]" }), isStreaming ? (_jsxs("button", { onClick: onAbort, className: "btn-danger flex-shrink-0 flex items-center gap-2", children: [_jsx("svg", { className: "w-4 h-4", viewBox: "0 0 16 16", fill: "currentColor", children: _jsx("rect", { x: "3", y: "3", width: "10", height: "10", rx: "1" }) }), _jsx("span", { children: "\u505C\u6B62" })] })) : (_jsxs("button", { onClick: handleSend, disabled: !text.trim() || disabled || !isConnected, className: "btn-primary flex-shrink-0 flex items-center gap-2", children: [_jsx("svg", { className: "w-4 h-4", viewBox: "0 0 16 16", fill: "currentColor", children: _jsx("path", { d: "M1.5 1.5L14.5 8L1.5 14.5L3.5 8L1.5 1.5Z" }) }), _jsx("span", { children: "\u53D1\u9001" })] }))] }), !isConnected && (_jsx("p", { className: "text-center text-xs text-brand-text-3 mt-2", children: "\u672A\u8FDE\u63A5\u5230\u670D\u52A1\u5668\uFF0C\u5C1D\u8BD5\u91CD\u8FDE\u4E2D\u2026" }))] }));
}
