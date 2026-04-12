"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { Activity, ArrowDown, ArrowUp, LayoutGrid, MessageSquare, PanelRight, Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArtifactsPreview } from "@/components/artifacts-preview";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ClarifyChoicePanel } from "@/components/clarify-choice-panel";
import { ReasoningTrace } from "@/components/reasoning-trace";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import { useAgent } from "@/hooks/use-agent";
import { useChatSession } from "@/hooks/use-chat-session";
import { useTranslations } from "@/hooks/use-translations";
import { clarifySessionKey, extractClarifyFromFrames, type ClarifyPrompt } from "@/lib/clarify-from-frames";
import { aggregateAssistantFromFrames, isAssistantReplyInFlight } from "@/lib/conversation-history";

const WS_URL = process.env.NEXT_PUBLIC_AGENT_WS_URL ?? "ws://localhost:8000/ws/agent";
const DiagnosticsDrawer = dynamic(
  () => import("@/components/diagnostics-drawer").then((m) => m.DiagnosticsDrawer),
  { ssr: false },
);

/** ChatGPT-style: pixels from bottom to treat as "following" the stream. */
const CHAT_STICKY_BOTTOM_PX = 80;

type WorkspaceTab = "artifacts" | "reasoning" | "observability";

export function ChatInterface() {
  const [message, setMessage] = useState("");
  /** Maps `clarifySessionKey` → chosen label (user picked from TOOL_CALL clarify UI). */
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>({});
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("artifacts");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const { t } = useTranslations();
  const { ready, sessionId, sessions, createSession, selectSession } = useChatSession();
  const { frames, turns, sendMessage, sendClarifyPick, status, connected, debug, permissions, hydrated } = useAgent(
    WS_URL,
    {
      sessionId,
    },
  );
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

  const runDemoPrompt = (prompt: string) => {
    stickToBottomRef.current = true;
    sendMessage(prompt);
    setMessage(prompt);
    requestAnimationFrame(() => scrollChatToBottom("smooth"));
  };

  const onClarifySelect = useCallback(
    (turnId: string, prompt: ClarifyPrompt, choice: string) => {
      const key = clarifySessionKey(turnId, prompt);
      stickToBottomRef.current = true;
      setClarifyAnswers((prev) => ({ ...prev, [key]: choice }));
      sendClarifyPick(choice, `关于「${prompt.question}」，我的选择是：${choice}`);
      requestAnimationFrame(() => scrollChatToBottom("smooth"));
      textareaRef.current?.focus();
    },
    [sendClarifyPick, scrollChatToBottom],
  );

  const statusLabel =
    status === "thinking"
      ? t.states.thinking
      : status === "responding"
        ? t.states.responding
        : status === "waiting_clarify"
          ? t.states.waitingClarify
          : t.states.idle;

  if (!ready) {
    return (
      <div className="hermes-grid flex h-full min-h-0 flex-1 items-center justify-center bg-[var(--bg-base)] text-sm text-zinc-500">
        {t.labels.loadingChat}
      </div>
    );
  }

  return (
    <div className="hermes-grid relative z-[1] flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--bg-base)]">
      {/* Header: minimal IDE-adjacent chrome */}
      <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-3 py-2.5 md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-sidebar)] text-zinc-400">
              <Sparkles className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <h1 className="truncate text-[15px] font-medium tracking-tight text-zinc-100">{t.appName}</h1>
                <span className="hidden text-[11px] text-zinc-600 sm:inline">Hermes</span>
              </div>
              <p className="truncate text-xs text-zinc-500">{t.tagline}</p>
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
      <main className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col overflow-hidden md:flex-row">
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
              <label className="sr-only" htmlFor="hermes-chat-session-select">
                {t.labels.chatSessions}
              </label>
              <select
                id="hermes-chat-session-select"
                className="hermes-input max-w-[min(100%,12rem)] rounded-lg border border-[var(--border-hairline)] bg-black/25 py-1.5 pl-2 pr-7 text-[11px] text-zinc-200"
                value={sessionId}
                onChange={(e) => selectSession(e.target.value)}
                aria-label={t.labels.chatSessions}
              >
                {sessions.map((s) => (
                  <option key={s.session_id} value={s.session_id}>
                    {s.title || s.session_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
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
              <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-2">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={status}
                    initial={{ opacity: 0.85 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0.85 }}
                    transition={{ duration: 0.15 }}
                    className="mb-6 flex items-center gap-3 text-[11px] text-zinc-500"
                  >
                    <span className="h-px flex-1 bg-[var(--border-hairline)]" />
                    <span className="shrink-0 tabular-nums">{statusLabel}</span>
                    <span className="h-px flex-1 bg-[var(--border-hairline)]" />
                  </motion.div>
                </AnimatePresence>

                {hasTranscript ? (
                  <div className="space-y-8">
                    {turns.map((turn, ti) => {
                      const assistantText = aggregateAssistantFromFrames(turn.frames);
                      const hasAssistantText = assistantText.trim().length > 0;
                      const isLastTurn = ti === turns.length - 1;
                      const clarify = extractClarifyFromFrames(turn.frames);
                      const clarifyKey = clarify ? clarifySessionKey(turn.turn_id, clarify) : null;
                      const answeredChoice = clarifyKey ? clarifyAnswers[clarifyKey] : undefined;

                      const showLiveIndicator =
                        isLastTurn &&
                        connected &&
                        (status === "thinking" ||
                          (status === "responding" && isAssistantReplyInFlight(turn.frames)));

                      const showAssistantColumn = Boolean(clarify) || hasAssistantText || showLiveIndicator;

                      const showBubble = hasAssistantText || showLiveIndicator;
                      const thinkingOnlyInBubble = showLiveIndicator && !hasAssistantText;
                      const thinkingFooterInBubble = showLiveIndicator && hasAssistantText;

                      return (
                        <div key={turn.turn_id} className="space-y-4">
                          {turn.user_text ? (
                            <div className="flex justify-end" role="article" aria-label={t.labels.chatUser}>
                              <div className="max-w-[min(100%,85%)] rounded-2xl rounded-br-md border border-[var(--border-hairline)] bg-zinc-800/85 px-4 py-2.5 text-[15px] leading-relaxed text-zinc-100 shadow-[0_1px_0_rgba(0,0,0,0.35)]">
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
                                    answeredChoice={answeredChoice ?? null}
                                    disabled={!connected}
                                    onSelect={(choice) => onClarifySelect(turn.turn_id, clarify, choice)}
                                    labels={{
                                      clarifyPickOne: t.labels.clarifyPickOne,
                                      clarifyFallbackHint: t.labels.clarifyFallbackHint,
                                      clarifyYourChoice: t.labels.clarifyYourChoice,
                                    }}
                                  />
                                ) : null}
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
                <button
                  type="submit"
                  disabled={!message.trim()}
                  className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 transition enabled:hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t.actions.send}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <p className="px-1 text-center text-[11px] text-zinc-600">{t.labels.demoTemplates}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {t.demoPrompts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="rounded-full border border-[var(--border-hairline)] bg-black/20 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-[var(--border-strong)] hover:bg-white/[0.04] hover:text-zinc-200"
                    onClick={() => runDemoPrompt(item.prompt)}
                  >
                    {item.label}
                  </button>
                ))}
                {permissions.canRunBenchmark ? (
                  <button
                    type="button"
                    className="rounded-full border border-dashed border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-300"
                    onClick={() => sendMessage("/benchmark")}
                  >
                    {t.actions.runBenchmark}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </section>

        {/* Right rail: Cursor-style workspace — tabs so each pane gets full height (no stacked squeeze) */}
        <aside className="flex min-h-0 w-full min-w-0 flex-1 flex-col border-t border-[var(--border-hairline)] bg-[var(--bg-sidebar)] md:w-[min(100%,28rem)] md:max-w-[min(100%,28rem)] md:flex-none md:border-l md:border-t-0 lg:w-[min(100%,32rem)] lg:max-w-[32rem] xl:w-[34rem] xl:max-w-[34rem]">
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-hairline)] px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            <PanelRight className="h-3.5 w-3.5" aria-hidden />
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
              <div className="hermes-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
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
            ) : null}
          </div>
        </aside>
      </main>
    </div>
  );
}
