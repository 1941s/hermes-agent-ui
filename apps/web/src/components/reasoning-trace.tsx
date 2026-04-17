"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ChevronDown, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useTranslations } from "@/hooks/use-translations";
import type { AgentFrame } from "@/types";

type Props =
  | {
      frames: AgentFrame[];
      variant: "embedded";
    }
  | {
      frames: AgentFrame[];
      variant?: "collapsible";
      open: boolean;
      onOpenChange: (open: boolean) => void;
    };

const STICKY_BOTTOM_THRESHOLD_PX = 48;
const VIRTUALIZE_THRESHOLD_FRAMES = 180;
const OVERSCAN_PX = 480;
const CARD_BASE_HEIGHT = 46;
const CARD_VERTICAL_GAP = 8;
const COLLAPSIBLE_VIEWPORT_HEIGHT = 360;
const VIRTUAL_FADE_IN_S = 0.12;

function getFrameKey(frame: AgentFrame): string {
  return `${frame.trace_id}-${frame.seq}`;
}

function mergeStreamingFrames(frames: AgentFrame[]): AgentFrame[] {
  const merged: AgentFrame[] = [];
  for (const frame of frames) {
    const prev = merged[merged.length - 1];
    const canMergeThought =
      frame.type === "THOUGHT" &&
      prev?.type === "THOUGHT" &&
      frame.trace_id === prev.trace_id &&
      (frame.payload.source ?? "reasoning") === (prev.payload.source ?? "reasoning");
    const canMergeResponseDelta =
      frame.type === "RESPONSE" &&
      prev?.type === "RESPONSE" &&
      frame.trace_id === prev.trace_id &&
      !Boolean(frame.payload.final) &&
      !Boolean(prev.payload.final) &&
      frame.payload.role === prev.payload.role;

    if (canMergeThought) {
      merged[merged.length - 1] = {
        ...prev,
        payload: {
          ...prev.payload,
          content: `${prev.payload.content}${frame.payload.content}`,
        },
      };
      continue;
    }
    if (canMergeResponseDelta) {
      merged[merged.length - 1] = {
        ...prev,
        payload: {
          ...prev.payload,
          content: `${prev.payload.content}${frame.payload.content}`,
        },
      };
      continue;
    }
    merged.push(frame);
  }
  return merged;
}

function estimateCardHeight(frame: AgentFrame): number {
  const payloadStr = JSON.stringify(frame.payload, null, 2);
  const lineCount = payloadStr.split("\n").length;
  return CARD_BASE_HEIGHT + lineCount * 18 + CARD_VERTICAL_GAP;
}

function toPrettyJson(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        return value;
      }
    }
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function TraceCard({ frame, withMotion }: { frame: AgentFrame; withMotion: boolean }) {
  const isThought = frame.type === "THOUGHT";
  const isTool = frame.type === "TOOL_CALL";
  const isResponse = frame.type === "RESPONSE";
  const isArtifact = frame.type === "ARTIFACT";

  const card = (
    <div
      className={`mb-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs ${
        isThought ? "border border-zinc-600/25" : isTool ? "border border-zinc-600/25" : "border border-[var(--border-hairline)]"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        {isTool ? <Wrench className="h-3.5 w-3.5 text-zinc-500" /> : null}
        <span className="font-semibold text-zinc-300">{frame.type}</span>
      </div>
      {isResponse ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] text-zinc-500">
            <span className="rounded border border-white/[0.12] px-1.5 py-0.5 font-mono">role: {String(frame.payload.role ?? "assistant")}</span>
            <span className="rounded border border-white/[0.12] px-1.5 py-0.5 font-mono">final: {String(Boolean(frame.payload.final))}</span>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2 text-[12px] leading-relaxed text-zinc-300 whitespace-pre-wrap break-words">
            {String(frame.payload.content ?? "")}
          </div>
        </div>
      ) : isThought ? (
        <div className="space-y-2">
          <div className="text-[10px] text-zinc-500">
            <span className="rounded border border-white/[0.12] px-1.5 py-0.5 font-mono">
              source: {String(frame.payload.source ?? "reasoning")}
            </span>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2 text-[12px] leading-relaxed text-zinc-300 whitespace-pre-wrap break-words">
            {String(frame.payload.content ?? "")}
          </div>
        </div>
      ) : isTool ? (
        <div className="space-y-2">
          <div className="text-[10px] text-zinc-500 font-mono break-all">
            id: {String(frame.payload.tool_call_id ?? "—")} | name: {String(frame.payload.name ?? "unknown")}
          </div>
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">args</div>
            <pre className="whitespace-pre-wrap break-words rounded-lg border border-white/[0.08] bg-zinc-950/80 p-2 text-[11px] leading-relaxed text-zinc-300">
              {toPrettyJson(frame.payload.args ?? {})}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">result</div>
            <pre className="whitespace-pre-wrap break-words rounded-lg border border-white/[0.08] bg-zinc-950/80 p-2 text-[11px] leading-relaxed text-zinc-300">
              {frame.payload.result == null ? "null" : toPrettyJson(frame.payload.result)}
            </pre>
          </div>
        </div>
      ) : isArtifact ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1 text-[10px] text-zinc-500">
            <span>artifact_id</span>
            <span className="break-all text-right font-mono text-zinc-300">{String(frame.payload.artifact_id ?? "—")}</span>
            <span>source_tool</span>
            <span className="break-all text-right font-mono text-zinc-300">{String(frame.payload.source_tool ?? "—")}</span>
            <span>artifact_type</span>
            <span className="text-right font-mono text-zinc-300">{String(frame.payload.artifact_type ?? "—")}</span>
            <span>mime</span>
            <span className="text-right font-mono text-zinc-300">{String(frame.payload.mime ?? "—")}</span>
            <span>truncated</span>
            <span className="text-right font-mono text-zinc-300">{String(Boolean(frame.payload.truncated))}</span>
            <span>original_length</span>
            <span className="text-right font-mono text-zinc-300">{String(frame.payload.original_length ?? "—")}</span>
            <span>blocked</span>
            <span className="text-right font-mono text-zinc-300">{String(Boolean(frame.payload.blocked))}</span>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">security_policy</div>
            <pre className="whitespace-pre-wrap break-words rounded-lg border border-white/[0.08] bg-zinc-950/80 p-2 text-[11px] leading-relaxed text-zinc-300">
              {toPrettyJson(frame.payload.security_policy ?? null)}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">content</div>
            <pre className="whitespace-pre-wrap break-words rounded-lg border border-white/[0.08] bg-zinc-950/80 p-2 text-[11px] leading-relaxed text-zinc-300">
              {frame.payload.content == null ? "null" : toPrettyJson(frame.payload.content)}
            </pre>
          </div>
        </div>
      ) : (
        <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-400">
          {JSON.stringify(frame.payload, null, 2)}
        </pre>
      )}
    </div>
  );

  if (!withMotion) {
    return card;
  }

  return (
    <motion.div
      key={getFrameKey(frame)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
    >
      {card}
    </motion.div>
  );
}

export function ReasoningTrace(props: Props) {
  const { frames } = props;
  const variant: "collapsible" | "embedded" = props.variant === "embedded" ? "embedded" : "collapsible";
  const { t } = useTranslations();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [scrollTop, setScrollTop] = useState(0);
  const seenVirtualKeysRef = useRef<Set<string>>(new Set());
  const displayFrames = useMemo(() => mergeStreamingFrames(frames), [frames]);
  const shouldVirtualize = displayFrames.length >= VIRTUALIZE_THRESHOLD_FRAMES;
  const viewportHeight = variant === "embedded" ? (scrollContainerRef.current?.clientHeight ?? 0) : COLLAPSIBLE_VIEWPORT_HEIGHT;

  const estimatedHeights = useMemo(() => displayFrames.map((f) => estimateCardHeight(f)), [displayFrames]);
  const offsets = useMemo(() => {
    const list: number[] = new Array(displayFrames.length);
    let acc = 0;
    for (let i = 0; i < displayFrames.length; i += 1) {
      list[i] = acc;
      acc += estimatedHeights[i] ?? 0;
    }
    return { list, total: acc };
  }, [displayFrames.length, estimatedHeights]);

  const visibleRange = useMemo(() => {
    if (!shouldVirtualize) return { start: 0, end: displayFrames.length };
    const top = Math.max(0, scrollTop - OVERSCAN_PX);
    const bottom = scrollTop + viewportHeight + OVERSCAN_PX;
    let start = 0;
    let end = displayFrames.length;
    for (let i = 0; i < offsets.list.length; i += 1) {
      const itemTop = offsets.list[i];
      const itemBottom = itemTop + (estimatedHeights[i] ?? 0);
      if (itemBottom >= top) {
        start = i;
        break;
      }
    }
    for (let i = start; i < offsets.list.length; i += 1) {
      const itemTop = offsets.list[i];
      if (itemTop > bottom) {
        end = i;
        break;
      }
    }
    return { start, end };
  }, [shouldVirtualize, displayFrames.length, scrollTop, viewportHeight, offsets.list, estimatedHeights]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !isAtBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [frames, isAtBottom]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const nextTop = e.currentTarget.scrollTop;
    if (shouldVirtualize) setScrollTop(nextTop);
    const remaining = e.currentTarget.scrollHeight - (nextTop + e.currentTarget.clientHeight);
    setIsAtBottom(remaining <= STICKY_BOTTOM_THRESHOLD_PX);
  };

  const scrollToBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const scrollClass =
    variant === "embedded"
      ? "hermes-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3"
      : "hermes-scrollbar max-h-[360px] overflow-y-auto overflow-x-hidden p-3";

  const traceBody = (
    <>
      {!shouldVirtualize ? (
        <AnimatePresence initial={false}>
          {displayFrames.map((frame) => (
            <TraceCard key={getFrameKey(frame)} frame={frame} withMotion />
          ))}
        </AnimatePresence>
      ) : (
        <div>
          <div style={{ height: `${offsets.list[visibleRange.start] ?? 0}px` }} />
          {displayFrames.slice(visibleRange.start, visibleRange.end).map((frame) => {
            const key = getFrameKey(frame);
            const isFirstVisible = !seenVirtualKeysRef.current.has(key);
            if (isFirstVisible) seenVirtualKeysRef.current.add(key);
            return (
              <motion.div
                key={key}
                initial={isFirstVisible ? { opacity: 0.82 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: VIRTUAL_FADE_IN_S, ease: "easeOut" }}
              >
                <TraceCard frame={frame} withMotion={false} />
              </motion.div>
            );
          })}
          <div
            style={{
              height: `${Math.max(0, offsets.total - (offsets.list[visibleRange.end] ?? offsets.total))}px`,
            }}
          />
        </div>
      )}
    </>
  );

  if (props.variant === "embedded") {
    return (
      <div className="hermes-panel flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
        <div className="shrink-0 border-b border-[var(--border-hairline)] px-3 py-2.5 text-[13px] font-medium text-zinc-200">
          {t.panes.reasoning}
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div ref={scrollContainerRef} className={`${scrollClass} h-full`} onScroll={onScroll}>
            {traceBody}
          </div>
          {!isAtBottom ? (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-zinc-300 shadow-lg shadow-black/30 backdrop-blur-md transition hover:bg-white/[0.06] hover:text-zinc-100"
              title={t.labels.scrollToBottom}
              aria-label={t.labels.scrollToBottom}
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const { open, onOpenChange } = props;

  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange} className="hermes-panel rounded-2xl">
      <Collapsible.Trigger className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-medium text-zinc-200 transition hover:bg-white/[0.03]">
        <span>{t.panes.reasoning}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </Collapsible.Trigger>
      <Collapsible.Content className="border-t border-[var(--border-hairline)]">
        <div className="relative">
          <div ref={scrollContainerRef} className={scrollClass} onScroll={onScroll}>
            {traceBody}
          </div>
          {!isAtBottom ? (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-3 right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-zinc-300 shadow-lg shadow-black/30 backdrop-blur-md transition hover:bg-white/[0.06] hover:text-zinc-100"
              title={t.labels.scrollToBottom}
              aria-label={t.labels.scrollToBottom}
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
