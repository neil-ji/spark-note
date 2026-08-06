import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
const TOOL_LABELS = {
    read: "读取文件",
    write: "写入文件",
    edit: "编辑文件",
    bash: "执行命令",
    grep: "搜索代码",
    find: "查找文件",
    ls: "列出目录",
};
export function ToolCallCard({ toolId, toolName, status, result, }) {
    const [isOpen, setIsOpen] = useState(false);
    const label = TOOL_LABELS[toolName] || toolName;
    return (_jsxs("div", { className: "my-1.5 border border-brand-border rounded-lg overflow-hidden", children: [_jsxs("button", { onClick: () => setIsOpen(!isOpen), className: "w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100\n                   transition-colors text-left", children: [_jsx("span", { className: "flex-shrink-0", children: status === "running" ? (_jsx("svg", { className: "w-4 h-4 text-blue-500 animate-spin", viewBox: "0 0 16 16", fill: "none", children: _jsx("circle", { cx: "8", cy: "8", r: "6", stroke: "currentColor", strokeWidth: "2", strokeDasharray: "28", strokeDashoffset: "10" }) })) : status === "error" ? (_jsx("svg", { className: "w-4 h-4 text-red-500", viewBox: "0 0 16 16", fill: "currentColor", children: _jsx("path", { d: "M8 2a6 6 0 110 12A6 6 0 018 2zm0 3a.75.75 0 00-.75.75v2.5a.75.75 0 001.5 0v-2.5A.75.75 0 008 5zm0 5.5a.75.75 0 100 1.5.75.75 0 000-1.5z" }) })) : (_jsx("svg", { className: "w-4 h-4 text-green-500", viewBox: "0 0 16 16", fill: "currentColor", children: _jsx("path", { d: "M8 2a6 6 0 110 12A6 6 0 018 2zm2.5 4.5l-3.5 3.5L5 8", stroke: "white", strokeWidth: "1.5", fill: "none" }) })) }), _jsx("span", { className: "text-xs font-medium text-brand-text", children: label }), _jsxs("span", { className: "text-xs text-brand-text-3", children: ["(", toolName, ")"] }), _jsx("span", { className: `text-xs ml-auto ${status === "running" ? "text-blue-500" :
                            status === "error" ? "text-red-500" : "text-green-600"}`, children: status === "running" ? "运行中…" :
                            status === "error" ? "失败" : "完成" }), _jsx("svg", { className: `w-3 h-3 text-brand-text-3 transition-transform ${isOpen ? "rotate-180" : ""}`, viewBox: "0 0 16 16", fill: "currentColor", children: _jsx("path", { d: "M4 6l4 4 4-4" }) })] }), isOpen && result && (_jsx("div", { className: "px-3 py-2 bg-white border-t border-brand-border", children: _jsx("pre", { className: "text-xs text-brand-text-2 whitespace-pre-wrap font-mono\n                          max-h-40 overflow-y-auto leading-relaxed", children: result }) })), isOpen && !result && status === "running" && (_jsx("div", { className: "px-3 py-2 bg-white border-t border-brand-border", children: _jsx("p", { className: "text-xs text-brand-text-3 italic", children: "\u7B49\u5F85\u7ED3\u679C\u2026" }) }))] }));
}
