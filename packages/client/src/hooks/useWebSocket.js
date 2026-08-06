import { useEffect, useRef, useCallback, useState } from "react";
export function useWebSocket({ url, onMessage, onOpen, onClose, }) {
    const wsRef = useRef(null);
    const [readyState, setReadyState] = useState(WebSocket.CONNECTING);
    const onMessageRef = useRef(onMessage);
    const onOpenRef = useRef(onOpen);
    const onCloseRef = useRef(onClose);
    // Keep callback refs fresh
    onMessageRef.current = onMessage;
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
    useEffect(() => {
        let ws;
        let reconnectTimer;
        let attempts = 0;
        const maxAttempts = 5;
        function connect() {
            ws = new WebSocket(url);
            ws.onopen = () => {
                setReadyState(WebSocket.OPEN);
                attempts = 0;
                onOpenRef.current?.();
            };
            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    onMessageRef.current(msg);
                }
                catch {
                    console.warn("Failed to parse WebSocket message:", event.data);
                }
            };
            ws.onclose = () => {
                setReadyState(WebSocket.CLOSED);
                onCloseRef.current?.();
                // Reconnect with backoff
                if (attempts < maxAttempts) {
                    const delay = Math.min(1000 * Math.pow(2, attempts), 10000);
                    attempts++;
                    console.log(`WebSocket reconnecting in ${delay}ms (attempt ${attempts}/${maxAttempts})`);
                    reconnectTimer = setTimeout(connect, delay);
                }
            };
            ws.onerror = () => {
                // onclose will fire after this
            };
            wsRef.current = ws;
        }
        connect();
        return () => {
            clearTimeout(reconnectTimer);
            ws?.close();
        };
    }, [url]);
    const send = useCallback((msg) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(msg));
        }
    }, []);
    return {
        send,
        readyState,
        isConnected: readyState === WebSocket.OPEN,
    };
}
