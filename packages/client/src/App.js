import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useAgentSession } from "./hooks/useAgentSession";
import { ChatView } from "./components/ChatView";
import { ContentView } from "./components/ContentView";
import { DnaView } from "./components/DnaView";
// WebSocket URL — in dev, Vite proxies /ws to the backend
const WS_URL = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;
const TABS = [
    { id: "chat", label: "对话", icon: "💬" },
    { id: "content", label: "内容", icon: "📄" },
    { id: "dna", label: "写作 DNA", icon: "🧬" },
];
export default function App() {
    const [activeTab, setActiveTab] = useState("chat");
    const { messages, isStreaming, isConnected, error, sendPrompt, abort, clearMessages, } = useAgentSession(WS_URL);
    return (_jsxs("div", { className: "h-screen flex flex-col", children: [_jsx("header", { className: "flex-shrink-0 bg-white border-b border-brand-border", children: _jsxs("div", { className: "max-w-6xl mx-auto px-4 h-14 flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-8 h-8 rounded-lg bg-brand flex items-center justify-center", children: _jsx("svg", { className: "w-5 h-5 text-white", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5", stroke: "currentColor", strokeWidth: "1.5", fill: "none" }) }) }), _jsxs("div", { children: [_jsx("h1", { className: "text-sm font-bold text-brand-text", children: "spark-note" }), _jsx("p", { className: "text-xs text-brand-text-3", children: "\u5185\u5BB9\u8FD0\u8425\u667A\u80FD\u4F53" })] })] }), _jsx("nav", { className: "flex items-center gap-1", children: TABS.map((tab) => (_jsxs("button", { onClick: () => setActiveTab(tab.id), className: `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id
                                    ? "bg-brand/10 text-brand"
                                    : "text-brand-text-2 hover:text-brand-text hover:bg-gray-50"}`, children: [_jsx("span", { className: "mr-1.5", children: tab.icon }), tab.label] }, tab.id))) })] }) }), _jsxs("main", { className: "flex-1 min-h-0", children: [activeTab === "chat" && (_jsx(ChatView, { messages: messages, isStreaming: isStreaming, isConnected: isConnected, error: error, onSend: sendPrompt, onAbort: abort, onClear: clearMessages })), activeTab === "content" && _jsx(ContentView, {}), activeTab === "dna" && _jsx(DnaView, {})] })] }));
}
