"use client";

import { UI_TEXT } from "@hermes-ui/config/ui-text";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

import { ArtifactsPreview } from "@/components/artifacts-preview";
import { DiagnosticsDrawer } from "@/components/diagnostics-drawer";
import { ReasoningTrace } from "@/components/reasoning-trace";
import { useAgent } from "@/hooks/use-agent";
import { useUiStore } from "@/stores/ui-store";

const WS_URL = process.env.NEXT_PUBLIC_AGENT_WS_URL ?? "ws://localhost:8000/ws/agent";
const DEMO_PROMPTS = [
  {
    id: "doc-summary",
    label: "Summarize API contract",
    prompt:
      "Read the backend websocket protocol and summarize it in 5 bullet points, then provide one JSON artifact that captures the frame taxonomy.",
  },
  {
    id: "code-explain",
    label: "Explain reconnect logic",
    prompt:
      "Explain the client reconnect strategy in simple terms, include edge cases, and provide a markdown checklist artifact for production readiness.",
  },
  {
    id: "artifact-gen",
    label: "Generate release checklist",
    prompt:
      "Create a release checklist for this monorepo (web/api/security/perf). Return both a concise response and an artifact in markdown format.",
  },
] as const;

export function ChatInterface() {
  const [message, setMessage] = useState("");
  const traceOpen = useUiStore((s) => s.traceOpen);
  const setTraceOpen = useUiStore((s) => s.setTraceOpen);
  const { frames, sendMessage, status, connected, debug, permissions } = useAgent(WS_URL);

  const responseText = useMemo(
    () =>
      frames
        .filter((f) => f.type === "RESPONSE")
        .map((f) => String(f.payload.content ?? ""))
        .join(""),
    [frames],
  );

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendMessage(message.trim());
    setMessage("");
  };

  const runDemoPrompt = (prompt: string) => {
    sendMessage(prompt);
    setMessage(prompt);
  };

  return (
    <div className="grid h-screen grid-cols-1 gap-4 p-4 md:grid-cols-[1.2fr_0.8fr]">
      <section className="flex min-h-0 flex-col rounded-xl border bg-black/40 p-4">
        <header className="mb-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold">{UI_TEXT.panes.chat}</h1>
          <span className={`text-xs ${connected ? "text-emerald-400" : "text-rose-400"}`}>
            {connected ? UI_TEXT.labels.online : UI_TEXT.labels.offline}
          </span>
        </header>

        <div className="mb-4 grow overflow-y-auto rounded-lg border bg-zinc-950/40 p-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={status}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mb-2 text-xs text-zinc-400"
            >
              {status === "thinking"
                ? UI_TEXT.states.thinking
                : status === "responding"
                  ? UI_TEXT.states.responding
                  : UI_TEXT.states.idle}
            </motion.div>
          </AnimatePresence>
          <div className="whitespace-pre-wrap text-sm">{responseText}</div>
        </div>

        <form className="flex gap-2" onSubmit={onSubmit}>
          <input
            className="w-full rounded-md border bg-zinc-950 px-3 py-2 text-sm outline-none"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={UI_TEXT.actions.placeholder}
          />
          {permissions.canRunBenchmark ? (
            <button
              className="rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200"
              type="button"
              onClick={() => sendMessage("/benchmark")}
            >
              {UI_TEXT.actions.runBenchmark}
            </button>
          ) : null}
          <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium" type="submit">
            {UI_TEXT.actions.send}
          </button>
        </form>
        <div className="mt-3 rounded border bg-zinc-950/50 p-2 text-xs text-zinc-300">
          <div className="mb-2 font-medium">{UI_TEXT.labels.demoTemplates}</div>
          <div className="flex flex-wrap gap-2">
            {DEMO_PROMPTS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200"
                onClick={() => runDemoPrompt(item.prompt)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 rounded border bg-zinc-950/50 p-2 text-xs text-zinc-400">
          <div className="mb-1 font-medium text-zinc-300">{UI_TEXT.labels.debug}</div>
          <div className="grid grid-cols-2 gap-1">
            <span>{UI_TEXT.labels.lastSeq}</span>
            <span>{debug.lastSeq}</span>
            <span>{UI_TEXT.labels.resumeSent}</span>
            <span>{debug.resumeSent}</span>
            <span>{UI_TEXT.labels.reconnectAttempts}</span>
            <span>{debug.reconnectAttempts}</span>
            <span>{UI_TEXT.labels.queuedMessages}</span>
            <span>{debug.queuedMessages}</span>
          </div>
        </div>
        <div className="mt-3">
          <DiagnosticsDrawer />
        </div>
      </section>

      <aside className="flex min-h-0 flex-col gap-4 rounded-xl border bg-black/40 p-4">
        <h2 className="text-sm font-semibold">{UI_TEXT.panes.artifacts}</h2>
        <ArtifactsPreview frames={frames} responseText={responseText} />
        <ReasoningTrace frames={frames} open={traceOpen} onOpenChange={setTraceOpen} />
      </aside>
    </div>
  );
}
