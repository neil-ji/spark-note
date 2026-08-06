import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard } from "./ToolCallCard";
export function MessageBubble({ message }) {
    const isUser = message.role === "user";
    // Extract blocks
    const textBlocks = message.content.filter((b) => b.type === "text");
    const thinkingBlocks = message.content.filter((b) => b.type === "thinking");
    const toolBlocks = message.content.filter((b) => b.type === "tool_call");
    const hasContent = textBlocks.length > 0 || thinkingBlocks.length > 0 || toolBlocks.length > 0;
    const isStreaming = message.content.length > 0 && textBlocks.length === 0 && toolBlocks.some(t => t.status === "running");
    if (!hasContent && !isStreaming) {
        // Empty placeholder while waiting for first content
        return (_jsx("div", { className: `flex ${isUser ? "justify-end" : "justify-start"} mb-4 animate-fade-in`, children: _jsx("div", { className: `max-w-[80%] px-4 py-2 rounded-2xl ${isUser
                    ? "bg-brand text-white rounded-br-md"
                    : "bg-brand-surface border border-brand-border rounded-bl-md"}`, children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "inline-block w-2 h-2 bg-brand-text-3 rounded-full animate-pulse-dot" }), _jsx("span", { className: "text-sm text-brand-text-3", children: "\u7B49\u5F85\u54CD\u5E94\u2026" })] }) }) }));
    }
    return (_jsx("div", { className: `flex ${isUser ? "justify-end" : "justify-start"} mb-4 animate-fade-in`, children: _jsxs("div", { className: `max-w-[85%] ${isUser ? "" : "w-full"}`, children: [!isUser && (_jsxs("div", { className: "flex items-center gap-2 mb-1 px-1", children: [_jsx("div", { className: "w-6 h-6 rounded-full bg-brand-teal/10 flex items-center justify-center", children: _jsx("svg", { className: "w-3.5 h-3.5 text-brand-teal", viewBox: "0 0 16 16", fill: "currentColor", children: _jsx("path", { d: "M8 2a4 4 0 00-4 4v1H3a1 1 0 00-1 1v5a1 1 0 001 1h10a1 1 0 001-1V8a1 1 0 00-1-1h-1V6a4 4 0 00-4-4zm-2.5 5V6a2.5 2.5 0 015 0v1h-5z" }) }) }), _jsx("span", { className: "text-xs font-medium text-brand-text-3", children: "spark-note" })] })), _jsxs("div", { className: `px-4 py-3 ${isUser
                        ? "bg-brand text-white rounded-2xl rounded-br-md shadow-sm"
                        : "bg-brand-surface border border-brand-border rounded-2xl rounded-bl-md shadow-sm"}`, children: [toolBlocks.map((tool) => (_jsx(ToolCallCard, { toolId: tool.toolId, toolName: tool.toolName, status: tool.status, result: tool.result }, tool.toolId))), thinkingBlocks.map((block, i) => (_jsx(ThinkingBlock, { text: block.text, isStreaming: isStreaming && i === thinkingBlocks.length - 1 }, i))), textBlocks.map((block, i) => (_jsxs("div", { className: `text-sm leading-relaxed whitespace-pre-wrap ${isUser ? "text-white" : "text-brand-text"}`, children: [block.text, isStreaming && i === textBlocks.length - 1 && (_jsx("span", { className: "inline-block w-0.5 h-4 bg-brand ml-0.5 animate-pulse align-middle" }))] }, i))), _jsx("div", { className: `text-xs mt-2 ${isUser ? "text-white/60" : "text-brand-text-3"}`, children: new Date(message.timestamp).toLocaleTimeString("zh-CN", {
                                hour: "2-digit",
                                minute: "2-digit",
                            }) })] })] }) }));
}
