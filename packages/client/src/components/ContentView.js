import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
export function ContentView() {
    const [issues, setIssues] = useState([]);
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        fetch("/api/content/issues")
            .then((r) => r.json())
            .then(({ data }) => {
            setIssues(data || []);
            setLoading(false);
        })
            .catch((err) => {
            setError(err.message);
            setLoading(false);
        });
    }, []);
    const loadIssue = async (id) => {
        setSelected(null);
        try {
            const r = await fetch(`/api/content/issue/${id}`);
            const { data, error } = await r.json();
            if (error)
                throw new Error(error);
            setSelected(data);
        }
        catch (err) {
            setError(err.message);
        }
    };
    return (_jsxs("div", { className: "flex h-full", children: [_jsxs("div", { className: "w-72 border-r border-brand-border bg-white overflow-y-auto", children: [_jsxs("div", { className: "p-4 border-b border-brand-border", children: [_jsx("h2", { className: "text-sm font-semibold text-brand-text", children: "\u300A\u542C\u8FC7\u300B\u5468\u520A" }), _jsxs("p", { className: "text-xs text-brand-text-3 mt-1", children: ["\u5171 ", issues.length, " \u671F"] })] }), loading && (_jsx("div", { className: "p-4 text-sm text-brand-text-3", children: "\u52A0\u8F7D\u4E2D\u2026" })), error && (_jsx("div", { className: "p-4 text-sm text-red-500", children: error })), issues.map((issue) => (_jsxs("button", { onClick: () => loadIssue(issue.id), className: `w-full text-left px-4 py-3 border-b border-brand-border/50
                       hover:bg-gray-50 transition-colors
                       ${selected?.id === issue.id ? "bg-brand/5 border-l-2 border-l-brand" : ""}`, children: [_jsx("div", { className: "text-xs text-brand-text-3", children: issue.date }), _jsxs("div", { className: "text-sm font-medium text-brand-text mt-0.5", children: ["\u7B2C ", issue.number, " \u671F"] }), issue.title && (_jsx("div", { className: "text-xs text-brand-text-2 mt-0.5 truncate", children: issue.title })), _jsxs("div", { className: "flex items-center gap-2 mt-1.5", children: [issue.hasManuscript && (_jsx("span", { className: "text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded", children: "\u6587\u7A3F" })), issue.hasHtml && (_jsx("span", { className: "text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded", children: "HTML" })), issue.hasPngs && (_jsxs("span", { className: "text-xs px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded", children: ["PNG \u00D7", issue.pngCount] }))] })] }, issue.id)))] }), _jsx("div", { className: "flex-1 overflow-y-auto p-6", children: !selected ? (_jsx("div", { className: "flex items-center justify-center h-full text-sm text-brand-text-3", children: "\u9009\u62E9\u4E00\u671F\u67E5\u770B\u8BE6\u60C5" })) : (_jsxs("div", { children: [selected.pngs && selected.pngs.length > 0 && (_jsxs("div", { className: "mb-6", children: [_jsx("h3", { className: "text-sm font-semibold text-brand-text mb-3", children: "\u5361\u7247\u9884\u89C8" }), _jsx("div", { className: "grid grid-cols-2 lg:grid-cols-3 gap-4", children: selected.pngs.map((png, i) => (_jsx("div", { className: "card overflow-hidden", children: _jsx("img", { src: png, alt: `Card ${i + 1}`, className: "w-full h-auto", loading: "lazy" }) }, i))) })] })), selected.manuscript && (_jsxs("div", { className: "mb-6", children: [_jsx("h3", { className: "text-sm font-semibold text-brand-text mb-3", children: "\u6587\u7A3F" }), _jsx("div", { className: "card p-4", children: _jsx("pre", { className: "text-sm text-brand-text-2 whitespace-pre-wrap font-sans leading-relaxed", children: selected.manuscript }) })] }))] })) })] }));
}
