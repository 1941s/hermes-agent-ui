"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Wrench } from "lucide-react";
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

function TraceCard({ frame, withMotion }: { frame: AgentFrame; withMotion: boolean }) {
  const isThought = frame.type === "THOUGHT";
  const isTool = frame.type === "TOOL_CALL";

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
      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-400">
        {JSON.stringify(frame.payload, null, 2)}
      </pre>
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
        <div ref={scrollContainerRef} className={scrollClass} onScroll={onScroll}>
          {traceBody}
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
        <div ref={scrollContainerRef} className={scrollClass} onScroll={onScroll}>
          {traceBody}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
