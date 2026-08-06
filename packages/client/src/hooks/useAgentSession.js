import { useState, useCallback, useRef } from "react";
import { useWebSocket } from "./useWebSocket";
let _msgCounter = 0;
function nextId() {
    return `msg_${Date.now()}_${++_msgCounter}`;
}
export function useAgentSession(wsUrl) {
    const [messages, setMessages] = useState([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState(null);
    const currentAssistantRef = useRef(null);
    const handleMessage = useCallback((msg) => {
        setError(null);
        switch (msg.type) {
            case "agent_start":
                setIsStreaming(true);
                // Create empty assistant message placeholder
                {
                    const id = nextId();
                    currentAssistantRef.current = id;
                    setMessages((prev) => [
                        ...prev,
                        {
                            id,
                            role: "assistant",
                            content: [],
                            timestamp: Date.now(),
                        },
                    ]);
                }
                break;
            case "text_delta":
                appendToCurrentMessage({ type: "text", text: msg.delta }, (block) => {
                    if (block.type === "text") {
                        return { ...block, text: block.text + msg.delta };
                    }
                    return block;
                });
                break;
            case "thinking_delta":
                appendToCurrentMessage({ type: "thinking", text: msg.delta }, (block) => {
                    if (block.type === "thinking") {
                        return { ...block, text: block.text + msg.delta };
                    }
                    return block;
                });
                break;
            case "tool_start":
                appendToCurrentMessage({
                    type: "tool_call",
                    toolId: msg.toolId,
                    toolName: msg.toolName,
                    status: "running",
                }, undefined // always append new block for tool calls
                );
                break;
            case "tool_exec_end":
                // Update the matching tool_call block status
                updateCurrentMessage((msg_) => {
                    if (msg_.role !== "assistant")
                        return msg_;
                    const content = msg_.content.map((block) => {
                        if (block.type === "tool_call" &&
                            block.toolName === msg.toolName &&
                            block.status === "running") {
                            return {
                                ...block,
                                status: msg.isError ? "error" : "done",
                                result: msg.result,
                            };
                        }
                        return block;
                    });
                    return { ...msg_, content };
                });
                break;
            case "agent_done":
                setIsStreaming(false);
                currentAssistantRef.current = null;
                break;
            case "error":
                setError(msg.message);
                setIsStreaming(false);
                break;
            case "status":
                // Update connection status — not critical for MVP
                break;
            default:
                // turn_end, tool_exec_start — informational, no state change needed
                break;
        }
    }, []);
    const { send, isConnected } = useWebSocket({
        url: wsUrl,
        onMessage: handleMessage,
    });
    const sendPrompt = useCallback((text) => {
        if (!text.trim())
            return;
        // Add user message
        const userMsg = {
            id: nextId(),
            role: "user",
            content: [{ type: "text", text: text.trim() }],
            timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        // Send to server
        send({ type: "prompt", text: text.trim() });
    }, [send]);
    const abort = useCallback(() => {
        send({ type: "abort" });
        setIsStreaming(false);
    }, [send]);
    const clearMessages = useCallback(() => {
        setMessages([]);
        currentAssistantRef.current = null;
    }, []);
    // Helper: append a content block to the current assistant message
    function appendToCurrentMessage(newBlock, merge) {
        const targetId = currentAssistantRef.current;
        if (!targetId)
            return;
        setMessages((prev) => prev.map((msg) => {
            if (msg.id !== targetId || msg.role !== "assistant")
                return msg;
            if (merge) {
                // Try to merge with the last block of the same type
                const last = msg.content[msg.content.length - 1];
                if (last && last.type === newBlock.type) {
                    const merged = merge(last);
                    if (merged) {
                        const content = [...msg.content];
                        content[content.length - 1] = merged;
                        return { ...msg, content };
                    }
                }
            }
            // Append as new block
            return { ...msg, content: [...msg.content, newBlock] };
        }));
    }
    // Helper: update the current assistant message
    function updateCurrentMessage(updater) {
        const targetId = currentAssistantRef.current;
        if (!targetId)
            return;
        setMessages((prev) => prev.map((msg) => {
            if (msg.id !== targetId)
                return msg;
            return updater(msg);
        }));
    }
    return {
        messages,
        isStreaming,
        isConnected,
        error,
        sendPrompt,
        abort,
        clearMessages,
    };
}
