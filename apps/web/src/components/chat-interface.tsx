"use client";

// NOTE: temporarily avoid framer-motion runtime mismatch in dev SSR.
import dynamic from "next/dynamic";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Check,
  Circle,
  LayoutGrid,
  MessageSquare,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  Pencil,
  Plus,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArtifactsPreview } from "@/components/artifacts-preview";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ClarifyChoicePanel } from "@/components/clarify-choice-panel";
import { ReasoningTrace } from "@/components/reasoning-trace";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import { useTranslations } from "@/hooks/use-translations";
import { clarifySessionKey, extractClarifyFromFrames, type ClarifyPrompt } from "@/lib/clarify-from-frames";
import { aggregateAssistantFromFrames, isAssistantReplyInFlight } from "@/lib/conversation-history";
import { useChatRuntime } from "@/providers/chat-runtime-provider";
import { useUiStore } from "@/stores/ui-store";

const DiagnosticsDrawer = dynamic(
  () => import("@/components/diagnostics-drawer").then((m) => m.DiagnosticsDrawer),
  { ssr: false },
);

/** ChatGPT-style: pixels from bottom to treat as "following" the stream. */
const CHAT_STICKY_BOTTOM_PX = 80;

type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

type TodoItem = {
  id: string;
  content: string;
  status: TodoStatus;
};

type TodoSummary = {
  total?: number;
  pending?: number;
  in_progress?: number;
  completed?: number;
  cancelled?: number;
};

type TodoArtifact = {
  artifactId: string;
  todos: TodoItem[];
  summary: TodoSummary | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value != null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseTodoArtifact(framePayload: Record<string, unknown>): TodoArtifact | null {
  if (String(framePayload.source_tool ?? "") !== "todo" || String(framePayload.artifact_type ?? "") !== "json") {
    return null;
  }
  const rawContent = framePayload.content;
  let parsed: unknown = rawContent;
  if (typeof rawContent === "string") {
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      return null;
    }
  }
  const parsedRecord = asRecord(parsed);
  if (!parsedRecord) return null;
  const rawTodos = Array.isArray(parsedRecord.todos) ? parsedRecord.todos : [];
  const todos: TodoItem[] = rawTodos
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const id = String(record.id ?? "");
      const content = String(record.content ?? "");
      const status = String(record.status ?? "") as TodoStatus;
      if (!id || !content || !["pending", "in_progress", "completed", "cancelled"].includes(status)) {
        return null;
      }
      return { id, content, status };
    })
    .filter((item): item is TodoItem => item != null);
  if (todos.length === 0) return null;

  const summaryRecord = asRecord(parsedRecord.summary);
  const summary: TodoSummary | null = summaryRecord
    ? {
        total: typeof summaryRecord.total === "number" ? summaryRecord.total : undefined,
        pending: typeof summaryRecord.pending === "number" ? summaryRecord.pending : undefined,
        in_progress: typeof summaryRecord.in_progress === "number" ? summaryRecord.in_progress : undefined,
        completed: typeof summaryRecord.completed === "number" ? summaryRecord.completed : undefined,
        cancelled: typeof summaryRecord.cancelled === "number" ? summaryRecord.cancelled : undefined,
      }
    : null;

  return {
    artifactId: String(framePayload.artifact_id ?? ""),
    todos,
    summary,
  };
}

function getTodoStatusMeta(status: TodoStatus, locale: "zh" | "en") {
  if (status === "completed") {
    return {
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
      label: locale === "zh" ? "已完成" : "Completed",
      badgeClass: "border-emerald-500/35 bg-emerald-500/15 text-emerald-200",
    };
  }
  if (status === "in_progress") {
    return {
      icon: <Circle className="h-4 w-4 text-sky-400" />,
      label: locale === "zh" ? "进行中" : "In Progress",
      badgeClass: "border-sky-500/35 bg-sky-500/15 text-sky-200",
    };
  }
  if (status === "cancelled") {
    return {
      icon: <Circle className="h-4 w-4 text-zinc-500" />,
      label: locale === "zh" ? "已取消" : "Cancelled",
      badgeClass: "border-zinc-600/40 bg-zinc-700/20 text-zinc-300",
    };
  }
  return {
    icon: <Circle className="h-4 w-4 text-zinc-400" />,
    label: locale === "zh" ? "待处理" : "Pending",
    badgeClass: "border-zinc-500/35 bg-zinc-500/10 text-zinc-300",
  };
}

export function ChatInterface() {
  const [message, setMessage] = useState("");
  /** Maps `clarifySessionKey` → chosen label (user picked from TOOL_CALL clarify UI). */
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>({});
  const workspaceTab = useUiStore((s) => s.workspaceTab);
  const setWorkspaceTab = useUiStore((s) => s.setWorkspaceTab);
  const workspaceCollapsed = useUiStore((s) => s.workspaceCollapsed);
  const toggleWorkspaceCollapsed = useUiStore((s) => s.toggleWorkspaceCollapsed);
  const workspaceWidth = useUiStore((s) => s.workspaceWidth);
  const chatHistoryCollapsed = useUiStore((s) => s.chatHistoryCollapsed);
  const chatHistoryWidth = useUiStore((s) => s.chatHistoryWidth);
  const setChatHistoryCollapsed = useUiStore((s) => s.setChatHistoryCollapsed);
  const toggleChatHistoryCollapsed = useUiStore((s) => s.toggleChatHistoryCollapsed);
  const setWorkspaceCollapsed = useUiStore((s) => s.setWorkspaceCollapsed);
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed);
  const setChatHistoryWidth = useUiStore((s) => s.setChatHistoryWidth);
  const setWorkspaceWidth = useUiStore((s) => s.setWorkspaceWidth);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [showObservabilityScrollToBottom, setShowObservabilityScrollToBottom] = useState(false);
  const historyAsideRef = useRef<HTMLElement | null>(null);
  const workspaceAsideRef = useRef<HTMLElement | null>(null);
  const observabilityScrollRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<null | { kind: "history" | "workspace"; startX: number; startWidth: number }>(null);
  const dragRafRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const { t, locale } = useTranslations();
  const {
    ready,
    sessionId,
    sessions,
    createSession,
    selectSession,
    renameSession,
    deleteSessionWithSnapshot,
    restoreSession,
    frames,
    turns,
    sendMessage,
    sendClarifyPick,
    stopGenerating,
    canStop,
    status,
    connected,
    debug,
    hydrated,
  } = useChatRuntime();
  const prevStatusRef = useRef(status);

  const responseText = useMemo(
    () =>
      frames
        .filter((f) => f.type === "RESPONSE")
        .map((f) => String(f.payload.content ?? ""))
        .join(""),
    [frames],
  );

  const hasTranscript = turns.length > 0;

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const onChatScroll = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = dist <= CHAT_STICKY_BOTTOM_PX;
    setShowScrollToBottom(dist > CHAT_STICKY_BOTTOM_PX && el.scrollHeight > el.clientHeight + 4);
  }, []);

  const onObservabilityScroll = useCallback(() => {
    const el = observabilityScrollRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setShowObservabilityScrollToBottom(remaining > 24 && el.scrollHeight > el.clientHeight + 4);
  }, []);

  const scrollObservabilityToBottom = useCallback(() => {
    const el = observabilityScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    scrollChatToBottom("auto");
  }, [responseText, frames.length, turns.length, status, scrollChatToBottom]);

  useEffect(() => {
    if (status === "thinking" && prevStatusRef.current !== "thinking") {
      setWorkspaceTab("reasoning");
    }
    prevStatusRef.current = status;
  }, [status]);

  const submitMessage = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed) return;
    stickToBottomRef.current = true;
    sendMessage(trimmed);
    setMessage("");
    requestAnimationFrame(() => scrollChatToBottom("smooth"));
    textareaRef.current?.focus();
  }, [message, sendMessage, scrollChatToBottom]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submitMessage();
  };

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  const formatRelativeTime = useCallback(
    (ts: number) => {
      const diff = Date.now() - ts;
      const minute = 60_000;
      const hour = 60 * minute;
      const day = 24 * hour;
      if (diff < minute) return locale === "zh" ? "刚刚" : "Just now";
      if (diff < hour) {
        const v = Math.floor(diff / minute);
        return locale === "zh" ? `${v} 分钟前` : `${v}m ago`;
      }
      if (diff < day) {
        const v = Math.floor(diff / hour);
        return locale === "zh" ? `${v} 小时前` : `${v}h ago`;
      }
      const v = Math.floor(diff / day);
      return locale === "zh" ? `${v} 天前` : `${v}d ago`;
    },
    [locale],
  );

  const pushToast = useCallback((next: { text: string; undo?: () => void }) => {
    if (toastTimerRef.current) {
      globalThis.clearTimeout(toastTimerRef.current);
    }
    setToast(next);
    toastTimerRef.current = globalThis.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 5000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        globalThis.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!workspaceDrawerOpen || typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (ev: MediaQueryListEvent) => {
      if (ev.matches) setWorkspaceDrawerOpen(false);
    };
    mq.addEventListener("change", onChange);
    if (mq.matches) setWorkspaceDrawerOpen(false);
    return () => mq.removeEventListener("change", onChange);
  }, [workspaceDrawerOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Auto-compact on narrow screens: collapse both inner rails.
    const mq = window.matchMedia("(max-width: 1279px)");
    const applyCompact = (matches: boolean) => {
      if (matches) {
        setSidebarCollapsed(true);
        setChatHistoryCollapsed(true);
        setWorkspaceCollapsed(true);
      }
    };
    applyCompact(mq.matches);
    const onChange = (ev: MediaQueryListEvent) => applyCompact(ev.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [setSidebarCollapsed, setChatHistoryCollapsed, setWorkspaceCollapsed]);

  useEffect(() => {
    if (chatHistoryCollapsed || !historyAsideRef.current) return;
    historyAsideRef.current.style.width = `${chatHistoryWidth}px`;
  }, [chatHistoryWidth, chatHistoryCollapsed]);

  useEffect(() => {
    if (workspaceCollapsed || !workspaceAsideRef.current) return;
    workspaceAsideRef.current.style.width = `${workspaceWidth}px`;
  }, [workspaceWidth, workspaceCollapsed]);

  const beginResize = useCallback((kind: "history" | "workspace", event: React.PointerEvent) => {
    event.preventDefault();
    const startWidth =
      kind === "history" ? historyAsideRef.current?.offsetWidth ?? chatHistoryWidth : workspaceAsideRef.current?.offsetWidth ?? workspaceWidth;
    dragStateRef.current = { kind, startX: event.clientX, startWidth };
    setIsResizing(true);
  }, [chatHistoryWidth, workspaceWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const clampHistory = (value: number) => Math.max(220, Math.min(420, value));
    const clampWorkspace = (value: number) => Math.max(320, Math.min(680, value));

    const flushWidth = () => {
      dragRafRef.current = null;
      const drag = dragStateRef.current;
      const width = pendingWidthRef.current;
      if (!drag || width == null) return;
      if (drag.kind === "history" && historyAsideRef.current) {
        historyAsideRef.current.style.width = `${width}px`;
      }
      if (drag.kind === "workspace" && workspaceAsideRef.current) {
        workspaceAsideRef.current.style.width = `${width}px`;
      }
    };

    const onMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      pendingWidthRef.current =
        drag.kind === "history"
          ? clampHistory(drag.startWidth + (event.clientX - drag.startX))
          : clampWorkspace(drag.startWidth - (event.clientX - drag.startX));
      if (dragRafRef.current == null) {
        dragRafRef.current = globalThis.requestAnimationFrame(flushWidth);
      }
    };

    const onUp = () => {
      if (dragRafRef.current != null) {
        globalThis.cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      const drag = dragStateRef.current;
      const width = pendingWidthRef.current;
      if (drag && width != null) {
        if (drag.kind === "history") setChatHistoryWidth(width);
        if (drag.kind === "workspace") setWorkspaceWidth(width);
      }
      pendingWidthRef.current = null;
      dragStateRef.current = null;
      setIsResizing(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
    };
  }, [isResizing, setChatHistoryWidth, setWorkspaceWidth]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isResizing) {
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    } else {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  const startRenameSession = useCallback((id: string, title: string) => {
    setRenamingSessionId(id);
    setRenamingTitle(title || "");
  }, []);

  const submitRenameSession = useCallback(async () => {
    if (!renamingSessionId) return;
    await renameSession(renamingSessionId, renamingTitle.trim() || (locale === "zh" ? "新对话" : "New chat"));
    setRenamingSessionId(null);
    setRenamingTitle("");
  }, [renamingSessionId, renamingTitle, renameSession, locale]);

  const deleteSessionWithUndo = useCallback(
    async (id: string) => {
      if (sessions.length <= 1 || deletingSession) return;
      setDeletingSession(true);
      try {
        const snapshot = await deleteSessionWithSnapshot(id);
        pushToast({
          text: locale === "zh" ? "会话已删除" : "Chat deleted",
          undo: snapshot
            ? () => {
                void restoreSession(snapshot);
              }
            : undefined,
        });
      } finally {
        setDeletingSession(false);
      }
    },
    [sessions.length, deletingSession, deleteSessionWithSnapshot, pushToast, locale, restoreSession],
  );

  const onClarifySelect = useCallback(
    (turnId: string, prompt: ClarifyPrompt, choice: string) => {
      // Guard against duplicate clarify submissions in same turn.
      const alreadyAnsweredThisTurn = Object.keys(clarifyAnswers).some((k) => k.startsWith(`${turnId}:`));
      if (alreadyAnsweredThisTurn) return;
      const key = clarifySessionKey(turnId, prompt);
      stickToBottomRef.current = true;
      setClarifyAnswers((prev) => ({ ...prev, [key]: choice }));
      sendClarifyPick(choice, `关于「${prompt.question}」，我的选择是：${choice}`);
      requestAnimationFrame(() => scrollChatToBottom("smooth"));
      textareaRef.current?.focus();
    },
    [clarifyAnswers, sendClarifyPick, scrollChatToBottom],
  );

  const statusLabel =
    status === "thinking"
      ? t.states.thinking
      : status === "responding"
        ? t.states.responding
        : status === "waiting_clarify"
          ? t.states.waitingClarify
          : t.states.idle;
  const useFluidChatWidth = workspaceCollapsed || workspaceWidth <= 320;

  const workspacePanel = (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-hairline)] px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        <button
          type="button"
          onClick={() => toggleWorkspaceCollapsed()}
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--border-hairline)] bg-black/20 text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
          title={workspaceCollapsed ? (locale === "zh" ? "展开工作区" : "Expand workspace") : (locale === "zh" ? "收起工作区" : "Collapse workspace")}
        >
          {workspaceCollapsed ? <PanelRight className="h-3.5 w-3.5" aria-hidden /> : <PanelRightClose className="h-3.5 w-3.5" aria-hidden />}
        </button>
        {t.panes.workspace}
      </div>
      <div className="flex shrink-0 gap-1 border-b border-[var(--border-hairline)] px-2 pb-2 pt-2" role="tablist" aria-label={t.panes.workspace}>
        <button
          type="button"
          role="tab"
          aria-selected={workspaceTab === "artifacts"}
          className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-center text-[12px] font-medium transition ${
            workspaceTab === "artifacts"
              ? "bg-white/[0.08] text-zinc-100 shadow-[0_1px_0_rgba(255,255,255,0.06)]"
              : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
          }`}
          onClick={() => setWorkspaceTab("artifacts")}
        >
          <LayoutGrid className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{t.panes.artifacts}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={workspaceTab === "reasoning"}
          className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-center text-[12px] font-medium transition ${
            workspaceTab === "reasoning"
              ? "bg-white/[0.08] text-zinc-100 shadow-[0_1px_0_rgba(255,255,255,0.06)]"
              : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
          }`}
          onClick={() => setWorkspaceTab("reasoning")}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{t.panes.reasoning}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={workspaceTab === "observability"}
          className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-center text-[12px] font-medium transition ${
            workspaceTab === "observability"
              ? "bg-white/[0.08] text-zinc-100 shadow-[0_1px_0_rgba(255,255,255,0.06)]"
              : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
          }`}
          onClick={() => setWorkspaceTab("observability")}
        >
          <Activity className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{t.panes.observability}</span>
        </button>
      </div>

      <div className="hermes-scrollbar flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-2">
        {workspaceTab === "artifacts" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ArtifactsPreview frames={frames} responseText={responseText} />
          </div>
        ) : null}
        {workspaceTab === "reasoning" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ReasoningTrace variant="embedded" frames={frames} />
          </div>
        ) : null}
        {workspaceTab === "observability" ? (
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div
              ref={observabilityScrollRef}
              className="hermes-scrollbar flex min-h-0 h-full flex-col gap-3 overflow-y-auto"
              onScroll={onObservabilityScroll}
            >
              <div className="rounded-lg border border-[var(--border-hairline)] bg-black/20 px-3 py-2.5 text-[11px] text-zinc-500">
                <div className="mb-1.5 font-medium text-zinc-400">{t.labels.debug}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px]">
                  <span>{t.labels.lastSeq}</span>
                  <span className="text-right text-zinc-300">{debug.lastSeq}</span>
                  <span>{t.labels.resumeSent}</span>
                  <span className="text-right text-zinc-300">{debug.resumeSent}</span>
                  <span>{t.labels.reconnectAttempts}</span>
                  <span className="text-right text-zinc-300">{debug.reconnectAttempts}</span>
                  <span>{t.labels.queuedMessages}</span>
                  <span className="text-right text-zinc-300">{debug.queuedMessages}</span>
                </div>
              </div>
              <DiagnosticsDrawer />
            </div>
            {showObservabilityScrollToBottom ? (
              <button
                type="button"
                onClick={scrollObservabilityToBottom}
                className="absolute bottom-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-zinc-300 shadow-lg shadow-black/30 backdrop-blur-md transition hover:bg-white/[0.06] hover:text-zinc-100"
                title={t.labels.scrollToBottom}
                aria-label={t.labels.scrollToBottom}
              >
                <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );

  if (!ready) {
    return <div className="p-6 text-sm text-zinc-500">{t.labels.loadingChat}</div>;
  }

  return (
    <div className="hermes-grid relative z-[1] flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* Header: minimal IDE-adjacent chrome */}
      <header className="sticky top-0 z-20 h-16 shrink-0 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] backdrop-blur-md">
        <div className="flex h-full items-center justify-between gap-4 px-3 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 leading-tight">
              <div className="flex flex-wrap items-baseline gap-2">
                <h1 className="truncate text-[15px] font-medium tracking-tight text-zinc-100">{t.panes.chat}</h1>
                <span className="hidden text-[11px] text-zinc-600 sm:inline">{sessionId ? sessionId.slice(0, 8) : "—"}</span>
              </div>
              <p className="truncate text-xs text-zinc-500">{locale === "zh" ? "会话工作台" : "Conversation workspace"}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            <div
              className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium ${
                connected
                  ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400/90"
                  : "border-rose-500/20 bg-rose-500/5 text-rose-400/90"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-400"}`} />
              {connected ? t.labels.online : t.labels.offline}
            </div>
          </div>
        </div>
      </header>

      {/* Cursor: main column + fixed right rail */}
      <main className={`flex min-h-0 w-full flex-1 flex-col overflow-hidden md:flex-row ${isResizing ? "select-none" : ""}`}>
        <aside
          ref={historyAsideRef}
          className={`hidden min-h-0 shrink-0 overflow-x-hidden border-r border-[var(--border-hairline)] bg-[var(--bg-sidebar)] transition-[width] duration-200 md:flex md:flex-col ${
            chatHistoryCollapsed ? "w-[56px]" : ""
          } ${isResizing && dragStateRef.current?.kind === "history" ? "transition-none" : ""}`}
          style={chatHistoryCollapsed ? undefined : { width: `${chatHistoryWidth}px`, willChange: "width", contain: "layout paint" }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-hairline)] px-3 py-2.5">
            {!chatHistoryCollapsed ? <span className="text-[12px] font-medium text-zinc-300">{t.labels.chatSessions}</span> : null}
            <div className={`flex items-center gap-1 ${chatHistoryCollapsed ? "w-full justify-center" : ""}`}>
              {!chatHistoryCollapsed ? (
                <button
                  type="button"
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-black/20 px-2 text-[11px] text-zinc-300 transition hover:bg-white/[0.04]"
                  onClick={() => void createSession()}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t.labels.newChat}
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-black/20 text-zinc-300 transition hover:bg-white/[0.04]"
                  onClick={() => void createSession()}
                  title={t.labels.newChat}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="hermes-scrollbar min-h-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto p-2">
            {sessions.map((s) => {
              const active = s.session_id === sessionId;
              const isRenaming = renamingSessionId === s.session_id;
              return (
                <div
                  key={s.session_id}
                  className={`group border transition ${
                    chatHistoryCollapsed
                      ? `mx-auto w-10 rounded-md p-1 ${
                          active
                            ? "border-zinc-600 bg-white/[0.06]"
                            : "border-transparent bg-black/10 hover:border-[var(--border-hairline)] hover:bg-white/[0.03]"
                        }`
                      : `${
                          active
                            ? "rounded-lg border-zinc-600 bg-white/[0.06]"
                            : "rounded-lg border-transparent bg-black/10 hover:border-[var(--border-hairline)] hover:bg-white/[0.03]"
                        } p-2`
                  }`}
                >
                  {isRenaming && !chatHistoryCollapsed ? (
                    <div className="space-y-2">
                      <input
                        autoFocus
                        value={renamingTitle}
                        onChange={(e) => setRenamingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitRenameSession();
                          if (e.key === "Escape") {
                            setRenamingSessionId(null);
                            setRenamingTitle("");
                          }
                        }}
                        className="hermes-input w-full rounded border border-[var(--border-hairline)] bg-black/30 px-2 py-1 text-xs text-zinc-200"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void submitRenameSession()}
                          className="rounded border border-emerald-500/30 bg-emerald-500/10 p-1 text-emerald-300"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingSessionId(null);
                            setRenamingTitle("");
                          }}
                          className="rounded border border-zinc-600 bg-black/30 p-1 text-zinc-300"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => selectSession(s.session_id)}
                        className={`${chatHistoryCollapsed ? "w-full text-center" : "w-full text-left"}`}
                      >
                        <div className={`${chatHistoryCollapsed ? "mx-auto flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-black/20 text-center" : ""}`}>
                          <div className="truncate text-[12px] font-medium text-zinc-200">
                            {chatHistoryCollapsed ? (s.title || s.session_id.slice(0, 1)).slice(0, 1) : s.title || (locale === "zh" ? "新对话" : "New chat")}
                          </div>
                          {!chatHistoryCollapsed ? (
                            <>
                              <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">
                                {s.preview || (locale === "zh" ? "暂无消息" : "No messages yet")}
                              </div>
                              <div className="mt-1 text-[10px] text-zinc-600">{formatRelativeTime(s.updated_at)}</div>
                            </>
                          ) : null}
                        </div>
                      </button>
                      {!chatHistoryCollapsed ? (
                        <div className="mt-2 hidden items-center gap-1 group-hover:flex">
                          <button
                            type="button"
                            onClick={() => startRenameSession(s.session_id, s.title)}
                            className="rounded border border-[var(--border-hairline)] bg-black/20 p-1 text-zinc-300 hover:bg-white/[0.06]"
                            title={locale === "zh" ? "重命名" : "Rename"}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteSessionWithUndo(s.session_id)}
                            disabled={sessions.length <= 1 || deletingSession}
                            className="rounded border border-rose-500/30 bg-rose-500/10 p-1 text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"
                            title={locale === "zh" ? "删除" : "Delete"}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="shrink-0 border-t border-[var(--border-hairline)] p-2">
            <button
              type="button"
              onClick={() => toggleChatHistoryCollapsed()}
              className={`inline-flex h-8 w-full items-center rounded-lg border border-[var(--border-hairline)] bg-black/20 text-[12px] font-medium text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200 ${
                chatHistoryCollapsed ? "justify-center" : "justify-center gap-2 px-2"
              }`}
              title={chatHistoryCollapsed ? (locale === "zh" ? "展开会话栏" : "Expand history") : (locale === "zh" ? "收起会话栏" : "Collapse history")}
            >
              {chatHistoryCollapsed ? <PanelLeft className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
              {!chatHistoryCollapsed ? <span>{locale === "zh" ? "收起会话栏" : "Collapse history"}</span> : null}
            </button>
          </div>
        </aside>
        {!chatHistoryCollapsed ? (
          <div
            role="separator"
            aria-orientation="vertical"
            className="group relative hidden w-1 shrink-0 cursor-col-resize bg-transparent lg:block"
            onPointerDown={(e) => beginResize("history", e)}
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--border-hairline)] transition group-hover:bg-zinc-500/70" />
          </div>
        ) : null}
        {/* Center: conversation + ChatGPT composer */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col border-[var(--border-hairline)] bg-[var(--bg-canvas)] md:border-r">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] px-4 py-2.5 md:px-5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
              <span className="truncate text-[13px] font-medium text-zinc-300">{t.panes.chat}</span>
              <button
                type="button"
                className="ml-1 inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-black/20 px-2 text-[11px] font-medium text-zinc-300 transition hover:border-[var(--border-strong)] hover:bg-white/[0.04] hover:text-zinc-100"
                onClick={() => void createSession()}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">{t.labels.newChat}</span>
              </button>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <button
                type="button"
                onClick={() => setWorkspaceDrawerOpen(true)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-black/20 text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200 lg:hidden"
                title={t.panes.workspace}
              >
                <PanelRight className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => toggleWorkspaceCollapsed()}
                className="hidden h-7 w-7 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-black/20 text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200 lg:inline-flex"
                title={workspaceCollapsed ? (locale === "zh" ? "展开工作区" : "Expand workspace") : (locale === "zh" ? "收起工作区" : "Collapse workspace")}
              >
                {workspaceCollapsed ? <PanelRight className="h-3.5 w-3.5" aria-hidden /> : <PanelRightClose className="h-3.5 w-3.5" aria-hidden />}
              </button>
              <Activity className="h-3 w-3" aria-hidden />
              <span className="hidden sm:inline">{t.labels.connection}</span>
              <span className="rounded-md border border-[var(--border-hairline)] bg-black/20 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                {!hydrated ? "…" : statusLabel}
              </span>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div
              ref={chatScrollRef}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              onScroll={onChatScroll}
              className="hermes-scrollbar h-full overflow-y-auto overflow-x-hidden overscroll-y-contain"
            >
              <div className={`w-full px-4 py-6 md:px-6 lg:px-8 ${useFluidChatWidth ? "max-w-none" : "max-w-[1200px]"}`}>
                <div className="mb-6 flex items-center gap-3 text-[11px] text-zinc-500">
                  <span className="h-px flex-1 bg-[var(--border-hairline)]" />
                  <span className="shrink-0 tabular-nums">{statusLabel}</span>
                  <span className="h-px flex-1 bg-[var(--border-hairline)]" />
                </div>

                {hasTranscript ? (
                  <div className="space-y-8">
                    {turns.map((turn, ti) => {
                      const assistantText = aggregateAssistantFromFrames(turn.frames);
                      const hasAssistantText = assistantText.trim().length > 0;
                      const todoArtifacts = turn.frames
                        .filter((frame) => frame.type === "ARTIFACT")
                        .map((frame) => parseTodoArtifact(frame.payload))
                        .filter((item): item is TodoArtifact => item != null);
                      const isLastTurn = ti === turns.length - 1;
                      const clarify = extractClarifyFromFrames(turn.frames);
                      const clarifyKey = clarify ? clarifySessionKey(turn.turn_id, clarify) : null;
                      const answeredChoice = clarifyKey ? clarifyAnswers[clarifyKey] : undefined;
                      const answeredInTurnEntry = Object.entries(clarifyAnswers).find(([k]) => k.startsWith(`${turn.turn_id}:`));
                      const answeredChoiceInTurn = answeredInTurnEntry?.[1];

                      const showLiveIndicator =
                        isLastTurn &&
                        connected &&
                        (status === "thinking" ||
                          (status === "responding" && isAssistantReplyInFlight(turn.frames)));

                      const showAssistantColumn = Boolean(clarify) || hasAssistantText || showLiveIndicator || todoArtifacts.length > 0;

                      const showBubble = hasAssistantText || showLiveIndicator;
                      const thinkingOnlyInBubble = showLiveIndicator && !hasAssistantText;
                      const thinkingFooterInBubble = showLiveIndicator && hasAssistantText;

                      return (
                        <div key={turn.turn_id} className="space-y-4">
                          {turn.user_text ? (
                            <div className="flex w-full justify-end" role="article" aria-label={t.labels.chatUser}>
                              <div className="ml-auto max-w-[min(100%,85%)] rounded-2xl rounded-br-md border border-[var(--border-hairline)] bg-zinc-800/85 px-4 py-2.5 text-[15px] leading-relaxed text-zinc-100 shadow-[0_1px_0_rgba(0,0,0,0.35)]">
                                <p className="whitespace-pre-wrap break-words">{turn.user_text}</p>
                              </div>
                            </div>
                          ) : null}
                          {showAssistantColumn ? (
                            <div className="flex justify-start gap-3" role="article" aria-label={t.labels.chatAssistant}>
                              <div
                                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--border-hairline)] bg-zinc-800/60 text-zinc-400"
                                aria-hidden
                              >
                                <Sparkles className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1 space-y-3">
                                {clarify ? (
                                  <ClarifyChoicePanel
                                    prompt={clarify}
                                    answeredChoice={answeredChoice ?? answeredChoiceInTurn ?? null}
                                    disabled={!connected}
                                    onSelect={(choice) => onClarifySelect(turn.turn_id, clarify, choice)}
                                    labels={{
                                      clarifyPickOne: t.labels.clarifyPickOne,
                                      clarifyFallbackHint: t.labels.clarifyFallbackHint,
                                      clarifyYourChoice: t.labels.clarifyYourChoice,
                                    }}
                                  />
                                ) : null}
                                {todoArtifacts.map((artifact, idx) => (
                                  <div
                                    key={`${turn.turn_id}-todo-${artifact.artifactId || idx}`}
                                    className="max-w-[min(100%,92%)] rounded-2xl rounded-bl-md border border-white/[0.08] bg-zinc-900/45 px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.35)]"
                                  >
                                    {(() => {
                                      const completed = artifact.summary?.completed ?? artifact.todos.filter((t) => t.status === "completed").length;
                                      const total = artifact.summary?.total ?? artifact.todos.length;
                                      const allDone = total > 0 && completed >= total;
                                      const title = locale === "zh" ? "任务进度" : "Todo Progress";

                                      const todoList = (
                                        <div className="space-y-2">
                                          {artifact.todos.map((todo) => {
                                            const status = getTodoStatusMeta(todo.status, locale);
                                            return (
                                              <div key={todo.id} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-2.5 py-2">
                                                <span className="shrink-0">{status.icon}</span>
                                                <div className="min-w-0 flex-1 text-[13px] text-zinc-200">{todo.content}</div>
                                                <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] ${status.badgeClass}`}>{status.label}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );

                                      if (!allDone) {
                                        return (
                                          <>
                                            <div className="mb-3 flex items-center justify-between gap-2">
                                              <div className="text-[13px] font-medium text-zinc-100">{title}</div>
                                              <div className="text-[11px] text-zinc-400">
                                                {completed}/{total}
                                              </div>
                                            </div>
                                            {todoList}
                                          </>
                                        );
                                      }

                                      return (
                                        <details className="group" open={false}>
                                          <summary className="mb-1 flex cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-medium text-zinc-100 marker:content-none">
                                            <span>{title}</span>
                                            <span className="text-[11px] text-emerald-300">
                                              {locale === "zh" ? "已完成" : "Completed"} · {completed}/{total}
                                            </span>
                                          </summary>
                                          <div className="mt-2">{todoList}</div>
                                        </details>
                                      );
                                    })()}
                                  </div>
                                ))}
                                {showBubble ? (
                                  <div
                                    className={`hermes-assistant-bubble min-w-0 max-w-[min(100%,92%)] rounded-2xl rounded-bl-md border border-[var(--border-hairline)] px-4 py-3 text-left shadow-[0_1px_0_rgba(0,0,0,0.35)] backdrop-blur-[2px] ${
                                      thinkingOnlyInBubble
                                        ? "hermes-assistant-bubble--thinking-only"
                                        : "bg-zinc-900/55"
                                    }`}
                                  >
                                    {hasAssistantText ? <ChatMarkdown content={assistantText} /> : null}
                                    {thinkingOnlyInBubble ? (
                                      <ThinkingIndicator label={t.states.thinking} />
                                    ) : null}
                                    {thinkingFooterInBubble ? (
                                      <div className="mt-3 border-t border-white/[0.06] pt-3">
                                        <ThinkingIndicator label={t.states.continuing} compact />
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-sidebar)]">
                      <Sparkles className="h-6 w-6 text-zinc-500" />
                    </div>
                    <p className="max-w-md text-sm leading-relaxed text-zinc-500">{t.labels.emptyChatHint}</p>
                  </div>
                )}
              </div>
            </div>
            {showScrollToBottom ? (
              <button
                type="button"
                className="absolute bottom-5 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-zinc-300 shadow-lg shadow-black/30 backdrop-blur-md transition hover:bg-white/[0.06] hover:text-zinc-100"
                aria-label={t.labels.scrollToBottom}
                title={t.labels.scrollToBottom}
                onClick={() => {
                  stickToBottomRef.current = true;
                  scrollChatToBottom("smooth");
                }}
              >
                <ArrowDown className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>

          {/* ChatGPT-style composer: rounded shell + circular send */}
          <div className="shrink-0 border-t border-[var(--border-hairline)] bg-[var(--bg-composer)] px-3 pb-4 pt-3 md:px-5">
            <form className="mx-auto w-full max-w-2xl space-y-3" onSubmit={onSubmit}>
              <div className="hermes-composer-shell flex items-end gap-2 rounded-[1.35rem] p-2 pl-3">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  className="hermes-input max-h-[min(40vh,220px)] min-h-[44px] w-full resize-none py-2.5 text-[15px] leading-relaxed text-zinc-100 placeholder:text-zinc-600"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={onComposerKeyDown}
                  placeholder={t.actions.placeholder}
                  autoComplete="off"
                  aria-label={t.actions.placeholder}
                />
                {canStop ? (
                  <button
                    type="button"
                    onClick={stopGenerating}
                    className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-500/45 bg-rose-500/15 text-rose-300 transition hover:border-rose-400 hover:bg-rose-500/25 hover:text-rose-200"
                    aria-label={t.actions.stop}
                    title={t.actions.stop}
                  >
                    <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!message.trim()}
                    className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 transition enabled:hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={t.actions.send}
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            </form>
          </div>
        </section>

        {/* Right rail: collapsible on desktop; drawer on smaller widths */}
        {!workspaceCollapsed ? (
          <div
            role="separator"
            aria-orientation="vertical"
            className="group relative hidden w-1 shrink-0 cursor-col-resize bg-transparent lg:block"
            onPointerDown={(e) => beginResize("workspace", e)}
          >
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--border-hairline)] transition group-hover:bg-zinc-500/70" />
          </div>
        ) : null}
        <aside
          ref={workspaceAsideRef}
          className={`relative hidden min-h-0 shrink-0 bg-[var(--bg-sidebar)] transition-[width] duration-200 lg:flex lg:flex-col ${
            workspaceCollapsed ? "w-[56px] border-l border-[var(--border-hairline)]" : ""
          } ${isResizing && dragStateRef.current?.kind === "workspace" ? "transition-none" : ""}`}
          style={workspaceCollapsed ? undefined : { width: `${workspaceWidth}px`, willChange: "width", contain: "layout paint" }}
        >
          <div className={`${workspaceCollapsed ? "hidden" : "flex min-h-0 flex-1 flex-col"} ${isResizing ? "pointer-events-none opacity-80" : ""}`}>
            {workspacePanel}
          </div>
          <div className={`${workspaceCollapsed ? "flex h-full flex-col items-center justify-between py-3" : "hidden"}`}>
            <button
              type="button"
              onClick={() => toggleWorkspaceCollapsed()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-black/20 text-zinc-300 transition hover:bg-white/[0.06]"
              title={locale === "zh" ? "展开工作区" : "Expand workspace"}
            >
              <PanelRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceTab("artifacts")}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${
                workspaceTab === "artifacts"
                  ? "border-zinc-500 bg-white/[0.08] text-zinc-100"
                  : "border-[var(--border-hairline)] bg-black/20 text-zinc-400"
              }`}
              title={t.panes.artifacts}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </aside>
      </main>
      {workspaceDrawerOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/45 lg:hidden">
          <div className="relative flex h-full w-full max-w-[92vw] flex-col border-l border-[var(--border-hairline)] bg-[var(--bg-sidebar)] shadow-2xl shadow-black/40">
            <button
              type="button"
              onClick={() => setWorkspaceDrawerOpen(false)}
              className="absolute right-3 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-black/20 text-zinc-300"
            >
              <X className="h-4 w-4" />
            </button>
            {workspacePanel}
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-zinc-200 shadow-xl shadow-black/30">
            <span>{toast.text}</span>
            {toast.undo ? (
              <button
                type="button"
                onClick={() => {
                  toast.undo?.();
                  setToast(null);
                }}
                className="rounded border border-[var(--border-hairline)] bg-black/20 px-2 py-0.5 font-medium text-zinc-100 hover:bg-white/[0.06]"
              >
                {locale === "zh" ? "撤销" : "Undo"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
