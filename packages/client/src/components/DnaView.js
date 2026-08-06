import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
export function DnaView() {
    const [files, setFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [content, setContent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        fetch("/api/content/dna")
            .then((r) => r.json())
            .then(({ data }) => {
            setFiles(data || []);
            setLoading(false);
        })
            .catch((err) => {
            setError(err.message);
            setLoading(false);
        });
    }, []);
    const loadFile = async (name) => {
        setSelectedFile(name);
        setContent(null);
        try {
            const r = await fetch(`/api/content/dna/${encodeURIComponent(name)}`);
            const text = await r.text();
            setContent(text);
        }
        catch (err) {
            setError(err.message);
        }
    };
    return (_jsxs("div", { className: "flex h-full", children: [_jsxs("div", { className: "w-72 border-r border-brand-border bg-white overflow-y-auto", children: [_jsxs("div", { className: "p-4 border-b border-brand-border", children: [_jsx("h2", { className: "text-sm font-semibold text-brand-text", children: "Writing DNA" }), _jsx("p", { className: "text-xs text-brand-text-3 mt-1", children: "\u5199\u4F5C\u98CE\u683C\u53C2\u8003\u6587\u6863" })] }), loading && (_jsx("div", { className: "p-4 text-sm text-brand-text-3", children: "\u52A0\u8F7D\u4E2D\u2026" })), error && (_jsx("div", { className: "p-4 text-sm text-red-500", children: error })), files.map((file) => (_jsxs("button", { onClick: () => loadFile(file.name), className: `w-full text-left px-4 py-3 border-b border-brand-border/50
                       hover:bg-gray-50 transition-colors
                       ${selectedFile === file.name ? "bg-brand/5 border-l-2 border-l-brand" : ""}`, children: [_jsx("div", { className: "text-sm font-medium text-brand-text", children: file.name.replace(".md", "") }), _jsx("div", { className: "text-xs text-brand-text-3 mt-0.5", children: ".md" })] }, file.name)))] }), _jsx("div", { className: "flex-1 overflow-y-auto p-6", children: !selectedFile ? (_jsx("div", { className: "flex items-center justify-center h-full text-sm text-brand-text-3", children: "\u9009\u62E9\u4E00\u4EFD\u6587\u6863\u67E5\u770B" })) : !content ? (_jsx("div", { className: "flex items-center justify-center h-full text-sm text-brand-text-3", children: "\u52A0\u8F7D\u4E2D\u2026" })) : (_jsxs("div", { className: "max-w-3xl", children: [_jsx("h3", { className: "text-lg font-semibold text-brand-text mb-4", children: selectedFile.replace(".md", "") }), _jsx("div", { className: "card p-6", children: _jsx("pre", { className: "text-sm text-brand-text-2 whitespace-pre-wrap font-sans leading-relaxed", children: content }) })] })) })] }));
}
