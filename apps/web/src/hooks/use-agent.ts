"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  appendFrameToTurns,
  buildHistoryFromTurns,
  flattenFramesFromTurns,
  maxSeqFromTurns,
  PENDING_TURN_PREFIX,
} from "@/lib/conversation-history";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { SessionManager } from "@/lib/session-manager";
import type { AgentFrame, ChatTurn } from "@/types";

export type { AgentFrame, ChatTurn } from "@/types";
export type AgentFrameType = AgentFrame["type"];

export type AgentStatus =
  | "thinking"
  | "responding"
  | "idle"
  | "disconnected"
  | "waiting_clarify";

const FLUSH_INTERVAL_MS = 16;
const HEARTBEAT_TIMEOUT_MS = 30000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;
const HISTORY_TURNS = 10;
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

export type UseAgentOptions = {
  /** External session id — when it changes, frames reset and turns hydrate from IndexedDB. */
  sessionId: string;
};

export function useAgent(wsUrl: string, options?: UseAgentOptions) {
  const sessionId = options?.sessionId ?? "";

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<AgentFrame[]>([]);
  const rafRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outboundQueueRef = useRef<string[]>([]);
  const isConnectingRef = useRef(false);
  const lastSeqRef = useRef<number>(-1);
  const lastResumeSeqRef = useRef<number>(-1);
  const pendingResponseRef = useRef(false);
  const manualStopRef = useRef(false);
  const userScopesRef = useRef<Set<string>>(parseScopesFromToken(AUTH_TOKEN));
  const persistTimerRef = useRef<number | null>(null);

  const frames = useMemo(() => flattenFramesFromTurns(turns), [turns]);

  const flushQueue = useCallback(() => {
    rafRef.current = null;
    if (!queueRef.current.length) return;
    const batch = queueRef.current.splice(0, queueRef.current.length);
    setTurns((prev) => {
      let next = prev;
      for (const frame of batch) {
        next = appendFrameToTurns(next, frame);
      }
      return next;
    });
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
      manualStopRef.current = false;
      reconnectAttemptRef.current = 0;
      setConnected(true);
      setStatus("idle");
      setError(null);
      resetHeartbeatTimeout();
      if (
        outboundQueueRef.current.length === 0 &&
        sessionIdRef.current &&
        (lastResumeSeqRef.current !== lastSeqRef.current || lastSeqRef.current < 0)
      ) {
        const cfg = getRuntimeConfig();
        ws.send(
          JSON.stringify({
            session_id: sessionIdRef.current,
            auth_token: AUTH_TOKEN,
            message: "",
            history: [],
            resume_from_seq: lastSeqRef.current,
            model_base_url: cfg.modelBaseUrl,
            model_api_key: cfg.modelApiKey,
            model_name: cfg.modelName,
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
          if (
            frame.type === "THOUGHT" ||
            frame.type === "TOOL_CALL" ||
            frame.type === "ARTIFACT" ||
            frame.type === "SUBAGENT"
          ) {
            setStatus("thinking");
          }
          if (frame.type === "RESPONSE") {
            setStatus("responding");
            if (Boolean(frame.payload.final)) {
              pendingResponseRef.current = false;
              setStatus("idle");
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
      if (manualStopRef.current) {
        manualStopRef.current = false;
        setStatus("idle");
        return;
      }
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
    let cancelled = false;
    setHydrated(false);
    setTurns([]);
    lastSeqRef.current = -1;
    lastResumeSeqRef.current = -1;
    queueRef.current = [];
    outboundQueueRef.current = [];

    if (!sessionId) {
      setHydrated(true);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const loaded = await SessionManager.getTurns(sessionId);
      if (cancelled) return;
      setTurns(loaded);
      lastSeqRef.current = maxSeqFromTurns(loaded);
      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!hydrated || !sessionId) return;
    connect();
    return () => {
      clearConnectionTimers();
      wsRef.current?.close();
    };
  }, [hydrated, sessionId, connect, clearConnectionTimers]);

  useEffect(() => {
    if (!sessionId || !hydrated) return;
    if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      void SessionManager.putTurns(sessionId, turns);
      void SessionManager.touchSessionFromTurns(sessionId, turns);
    }, 320);
    return () => {
      if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
    };
  }, [sessionId, turns, hydrated]);

  const sendMessage = useCallback(
    (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;
      const history = buildHistoryFromTurns(turnsRef.current, HISTORY_TURNS);
      const cfg = getRuntimeConfig();
      const pendingId = `${PENDING_TURN_PREFIX}${crypto.randomUUID()}`;
      setTurns((prev) => [...prev, { turn_id: pendingId, user_text: trimmed, frames: [] }]);
      const payload = JSON.stringify({
        session_id: sessionIdRef.current,
        auth_token: AUTH_TOKEN,
        message: trimmed,
        history,
        resume_from_seq: null,
        model_base_url: cfg.modelBaseUrl,
        model_api_key: cfg.modelApiKey,
        model_name: cfg.modelName,
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

  const sendClarifyPick = useCallback(
    (choice: string, userBubbleText: string) => {
      const c = choice.trim();
      if (!c) return;
      const bubble = userBubbleText.trim() || c;
      const history = buildHistoryFromTurns(turnsRef.current, HISTORY_TURNS);
      const cfg = getRuntimeConfig();
      const pendingId = `${PENDING_TURN_PREFIX}${crypto.randomUUID()}`;
      setTurns((prev) => [...prev, { turn_id: pendingId, user_text: bubble, frames: [] }]);
      const payload = JSON.stringify({
        session_id: sessionIdRef.current,
        auth_token: AUTH_TOKEN,
        message: "",
        history,
        resume_from_seq: null,
        clarify_pick: c,
        model_base_url: cfg.modelBaseUrl,
        model_api_key: cfg.modelApiKey,
        model_name: cfg.modelName,
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

  const stopGenerating = useCallback(() => {
    pendingResponseRef.current = false;
    outboundQueueRef.current = [];
    clearConnectionTimers();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      manualStopRef.current = true;
      wsRef.current.close(1000, "user_stop");
    } else {
      setStatus("idle");
    }
  }, [clearConnectionTimers]);

  const groupedFrames = useMemo(() => {
    const m: Record<string, AgentFrame[]> = {};
    for (const t of turns) {
      m[t.turn_id] = t.frames;
    }
    return m;
  }, [turns]);

  return {
    connected,
    error,
    frames,
    turns,
    groupedFrames,
    hydrated,
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
    sendClarifyPick,
    stopGenerating,
    canStop: status === "thinking" || status === "responding",
    status,
  };
}
