import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
export function ThinkingBlock({ text, isStreaming }) {
    const [isOpen, setIsOpen] = useState(false);
    if (!text && !isStreaming)
        return null;
    return (_jsxs("div", { className: "my-2", children: [_jsxs("button", { onClick: () => setIsOpen(!isOpen), className: "flex items-center gap-2 text-xs text-brand-text-3 hover:text-brand-text-2\n                   transition-colors group", children: [_jsxs("svg", { className: `w-3.5 h-3.5 ${isStreaming ? "animate-pulse-dot text-brand-teal" : ""}`, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [_jsx("path", { d: "M8 2C5.5 2 3.5 4 3.5 6.5c0 1 .5 2 1 2.5V13h7V9c.5-.5 1-1.5 1-2.5C12.5 4 10.5 2 8 2z" }), _jsx("circle", { cx: "8", cy: "5", r: "1", fill: "currentColor" })] }), _jsx("span", { children: isStreaming
                            ? "思考中…"
                            : `已思考 (${text.length} 字)` }), _jsx("svg", { className: `w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`, viewBox: "0 0 16 16", fill: "currentColor", children: _jsx("path", { d: "M4 6l4 4 4-4" }) })] }), isOpen && (_jsx("div", { className: "mt-2 p-3 bg-brand-teal/5 border border-brand-teal/20 rounded-lg\n                        text-xs text-brand-text-2 whitespace-pre-wrap font-mono leading-relaxed\n                        max-h-48 overflow-y-auto", children: text || (isStreaming ? "…" : "") }))] }));
}
