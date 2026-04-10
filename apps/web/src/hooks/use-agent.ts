"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type AgentFrameType = "THOUGHT" | "TOOL_CALL" | "ARTIFACT" | "RESPONSE" | "HEARTBEAT" | "ERROR" | "STATUS";

export type AgentFrame = {
  type: AgentFrameType;
  session_id: string;
  trace_id: string;
  seq: number;
  ts: string;
  payload: Record<string, unknown>;
};

export type AgentStatus = "thinking" | "responding" | "idle" | "disconnected";

const FLUSH_INTERVAL_MS = 16;
const HEARTBEAT_TIMEOUT_MS = 30000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;
const SESSION_STORAGE_PREFIX = "hermes-ui/session/";
const MAX_STORED_FRAMES = 800;
const MAX_TRACE_BUCKETS = 20;
const AUTH_TOKEN = process.env.NEXT_PUBLIC_AGENT_AUTH_TOKEN ?? null;
const SCOPE_BENCHMARK_RUN = "benchmark:run";

function parseScopesFromToken(token: string | null): Set<string> {
  if (!token) return new Set();
  const parts = token.split(".");
  if (parts.length < 2) return new Set();
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payloadRaw = atob(padded);
    const payload = JSON.parse(payloadRaw) as { scope?: unknown; scopes?: unknown };
    const out = new Set<string>();
    if (typeof payload.scope === "string") {
      for (const piece of payload.scope.split(" ")) {
        const scope = piece.trim();
        if (scope) out.add(scope);
      }
    }
    if (Array.isArray(payload.scopes)) {
      for (const piece of payload.scopes) {
        const scope = String(piece).trim();
        if (scope) out.add(scope);
      }
    }
    return out;
  } catch {
    return new Set();
  }
}

export function useAgent(wsUrl: string) {
  const [frames, setFrames] = useState<AgentFrame[]>([]);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<AgentFrame[]>([]);
  const traceBucketsRef = useRef<Map<string, AgentFrame[]>>(new Map());
  const rafRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(`sess_${Math.random().toString(36).slice(2)}`);
  const outboundQueueRef = useRef<string[]>([]);
  const isConnectingRef = useRef(false);
  const lastSeqRef = useRef<number>(-1);
  const lastResumeSeqRef = useRef<number>(-1);
  const pendingResponseRef = useRef(false);
  const userScopesRef = useRef<Set<string>>(parseScopesFromToken(AUTH_TOKEN));

  const getSessionStorageKey = useCallback(
    () => `${SESSION_STORAGE_PREFIX}${sessionIdRef.current}`,
    [],
  );

  const flushQueue = useCallback(() => {
    rafRef.current = null;
    if (!queueRef.current.length) return;
    const batch = queueRef.current.splice(0, queueRef.current.length);
    for (const frame of batch) {
      const list = traceBucketsRef.current.get(frame.trace_id) ?? [];
      list.push(frame);
      traceBucketsRef.current.set(frame.trace_id, list);
    }
    while (traceBucketsRef.current.size > MAX_TRACE_BUCKETS) {
      const oldestKey = traceBucketsRef.current.keys().next().value as string | undefined;
      if (!oldestKey) break;
      traceBucketsRef.current.delete(oldestKey);
    }
    setFrames((prev) => [...prev, ...batch].slice(-MAX_STORED_FRAMES));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.setTimeout(
      () => requestAnimationFrame(flushQueue),
      FLUSH_INTERVAL_MS,
    ) as unknown as number;
  }, [flushQueue]);

  const resetHeartbeatTimeout = useCallback(() => {
    if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    heartbeatTimerRef.current = setTimeout(() => {
      setConnected(false);
      setStatus("disconnected");
      wsRef.current?.close();
    }, HEARTBEAT_TIMEOUT_MS);
  }, []);

  const clearConnectionTimers = useCallback(() => {
    if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
  }, []);

  const persistFrames = useCallback(
    (nextFrames: AgentFrame[]) => {
      try {
        sessionStorage.setItem(getSessionStorageKey(), JSON.stringify(nextFrames.slice(-MAX_STORED_FRAMES)));
      } catch {
        // Ignore storage overflow; runtime stream should still continue.
      }
    },
    [getSessionStorageKey],
  );

  const flushOutboundQueue = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    while (outboundQueueRef.current.length) {
      const nextMessage = outboundQueueRef.current.shift();
      if (nextMessage) wsRef.current.send(nextMessage);
    }
  }, []);

  const connect = useCallback(() => {
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;
    clearConnectionTimers();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      isConnectingRef.current = false;
      reconnectAttemptRef.current = 0;
      setConnected(true);
      setStatus("idle");
      setError(null);
      resetHeartbeatTimeout();
      if (outboundQueueRef.current.length === 0 && lastSeqRef.current >= 0 && lastResumeSeqRef.current !== lastSeqRef.current) {
        ws.send(
          JSON.stringify({
            session_id: sessionIdRef.current,
            auth_token: AUTH_TOKEN,
            message: "",
            history: [],
            resume_from_seq: lastSeqRef.current,
          }),
        );
        lastResumeSeqRef.current = lastSeqRef.current;
      }
      flushOutboundQueue();
    };

    ws.onmessage = (event) => {
      resetHeartbeatTimeout();
      try {
        const frame = JSON.parse(event.data) as AgentFrame;
        if (typeof frame.seq === "number" && frame.seq > lastSeqRef.current) {
          lastSeqRef.current = frame.seq;
        }
        if (frame.type === "STATUS") {
          const state = (frame.payload.state as AgentStatus | undefined) ?? "idle";
          setStatus(state);
          if (state === "idle") {
            pendingResponseRef.current = false;
          }
        } else if (frame.type === "HEARTBEAT") {
          ws.send(JSON.stringify({ type: "HEARTBEAT", payload: { ping: "pong" } }));
        } else {
          if (frame.type === "THOUGHT" || frame.type === "TOOL_CALL" || frame.type === "ARTIFACT") {
            setStatus("thinking");
          }
          if (frame.type === "RESPONSE") {
            setStatus("responding");
            if (Boolean(frame.payload.final)) {
              pendingResponseRef.current = false;
            }
          }
          queueRef.current.push(frame);
          scheduleFlush();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown frame parse error");
      }
    };

    ws.onclose = () => {
      isConnectingRef.current = false;
      setConnected(false);
      setStatus("disconnected");
      if (outboundQueueRef.current.length > 0 || pendingResponseRef.current) {
        const attempt = reconnectAttemptRef.current + 1;
        reconnectAttemptRef.current = attempt;
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
        reconnectTimerRef.current = setTimeout(connect, delay);
      } else {
        setStatus("idle");
      }
    };

    ws.onerror = () => {
      isConnectingRef.current = false;
      setError("WebSocket transport error");
    };
  }, [clearConnectionTimers, flushOutboundQueue, resetHeartbeatTimeout, scheduleFlush, wsUrl]);

  useEffect(() => {
    try {
      const hydrated = sessionStorage.getItem(getSessionStorageKey());
      if (hydrated) {
        const parsed = JSON.parse(hydrated) as AgentFrame[];
        setFrames(parsed);
        for (const frame of parsed) {
          const list = traceBucketsRef.current.get(frame.trace_id) ?? [];
          list.push(frame);
          traceBucketsRef.current.set(frame.trace_id, list);
        }
      }
    } catch {
      // Ignore malformed storage.
    }
    connect();
    return () => {
      clearConnectionTimers();
      wsRef.current?.close();
    };
  }, [clearConnectionTimers, connect, getSessionStorageKey]);

  useEffect(() => {
    persistFrames(frames);
  }, [frames, persistFrames]);

  const sendMessage = useCallback(
    (message: string, history: Record<string, unknown>[] = []) => {
      const payload = JSON.stringify({
        session_id: sessionIdRef.current,
        auth_token: AUTH_TOKEN,
        message,
        history,
        resume_from_seq: null,
      });
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        outboundQueueRef.current.push(payload);
        if (!isConnectingRef.current) connect();
      } else {
        wsRef.current.send(payload);
      }
      pendingResponseRef.current = true;
      lastResumeSeqRef.current = -1;
      setStatus("thinking");
    },
    [connect],
  );

  const groupedFrames = useMemo(
    () => Object.fromEntries(traceBucketsRef.current.entries()),
    [frames],
  );

  return {
    connected,
    error,
    frames,
    groupedFrames,
    debug: {
      lastSeq: lastSeqRef.current,
      resumeSent: lastResumeSeqRef.current,
      reconnectAttempts: reconnectAttemptRef.current,
      queuedMessages: outboundQueueRef.current.length,
    },
    hasScope: (scope: string) => userScopesRef.current.has(scope),
    scopes: Array.from(userScopesRef.current),
    permissions: {
      canRunBenchmark: userScopesRef.current.has(SCOPE_BENCHMARK_RUN),
    },
    sendMessage,
    status,
  };
}
