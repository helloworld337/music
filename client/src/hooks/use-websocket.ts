import { useEffect, useRef, useCallback, useState } from "react";
import type { WsMessage } from "@shared/schema";

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

interface UseWebSocketOptions {
  onMessage?: (message: WsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (
      socketRef.current?.readyState === WebSocket.OPEN ||
      socketRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    setConnectionState("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setConnectionState("connected");
      options.onOpen?.();
    };

    socket.onclose = () => {
      setConnectionState("disconnected");
      options.onClose?.();
    };

    socket.onerror = (error) => {
      setConnectionState("error");
      options.onError?.(error);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WsMessage;
        options.onMessage?.(message);
      } catch (e) {
        console.error("Failed to parse WebSocket message:", e);
      }
    };

    socketRef.current = socket;
  }, [options]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setConnectionState("disconnected");
  }, []);

  const send = useCallback((message: WsMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connectionState,
    connect,
    disconnect,
    send,
    socket: socketRef.current,
  };
}
