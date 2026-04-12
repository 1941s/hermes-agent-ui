"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Wrench } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

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

const VIRTUALIZATION_THRESHOLD_LINES = 500;
const BASE_LINE_HEIGHT = 18;
const OVERSCAN_LINES = 30;
const STICKY_BOTTOM_THRESHOLD_PX = 48;
const COLLAPSE_VIEWPORT_PX = 360;

type TraceLine = {
  key: string;
  text: string;
  type: AgentFrame["type"];
};

export function ReasoningTrace(props: Props) {
  const { frames } = props;
  const variant: "collapsible" | "embedded" = props.variant === "embedded" ? "embedded" : "collapsible";
  const { t } = useTranslations();
  const [scrollTop, setScrollTop] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [viewportH, setViewportH] = useState(480);

  const traceLines = useMemo<TraceLine[]>(() => {
    const lines: TraceLine[] = [];
    frames.forEach((frame) => {
      const frameKey = `${frame.trace_id}-${frame.seq}`;
      lines.push({
        key: `${frameKey}-header`,
        text: `${frame.type}${frame.type === "TOOL_CALL" ? " [tool]" : ""}`,
        type: frame.type,
      });
      const payloadLines = JSON.stringify(frame.payload, null, 2).split("\n");
      payloadLines.forEach((line, index) => {
        lines.push({
          key: `${frameKey}-line-${index}`,
          text: line,
          type: frame.type,
        });
      });
      lines.push({
        key: `${frameKey}-spacer`,
        text: "",
        type: frame.type,
      });
    });
    return lines;
  }, [frames]);

  const lineHeight = useMemo(() => {
    const maxLen = traceLines.reduce((acc, line) => Math.max(acc, line.text.length), 0);
    if (maxLen > 180) return 28;
    if (maxLen > 90) return 22;
    return BASE_LINE_HEIGHT;
  }, [traceLines]);

  const shouldVirtualize = traceLines.length > VIRTUALIZATION_THRESHOLD_LINES;
  const viewportHeight = variant === "embedded" ? viewportH : COLLAPSE_VIEWPORT_PX;
  const totalHeight = traceLines.length * lineHeight;
  const startIndex = shouldVirtualize ? Math.max(0, Math.floor(scrollTop / lineHeight) - OVERSCAN_LINES) : 0;
  const visibleCount = shouldVirtualize ? Math.ceil(viewportHeight / lineHeight) + OVERSCAN_LINES * 2 : traceLines.length;
  const endIndex = Math.min(traceLines.length, startIndex + visibleCount);
  const visibleLines = shouldVirtualize ? traceLines.slice(startIndex, endIndex) : traceLines;

  useLayoutEffect(() => {
    if (variant !== "embedded") return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const measure = () => setViewportH(Math.max(240, el.clientHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [variant, frames]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !isAtBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [frames, isAtBottom]);

  const lineClassName = (type: AgentFrame["type"]): string => {
    if (type === "THOUGHT") return "text-zinc-300";
    if (type === "TOOL_CALL") return "text-zinc-400";
    return "text-zinc-200";
  };

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
          {frames.map((frame) => {
            const isThought = frame.type === "THOUGHT";
            const isTool = frame.type === "TOOL_CALL";
            return (
              <motion.div
                key={`${frame.trace_id}-${frame.seq}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className={`mb-2 rounded-xl bg-white/[0.04] px-3 py-2 text-xs ${
                  isThought
                    ? "border border-zinc-600/25"
                    : isTool
                      ? "border border-zinc-600/25"
                      : "border border-[var(--border-hairline)]"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  {isTool ? <Wrench className="h-3.5 w-3.5 text-zinc-500" /> : null}
                  <span className="font-semibold text-zinc-300">{frame.type}</span>
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-400">
                  {JSON.stringify(frame.payload, null, 2)}
                </pre>
              </motion.div>
            );
          })}
        </AnimatePresence>
      ) : (
        <div className="relative" style={{ height: `${totalHeight}px` }}>
          <div className="absolute left-0 right-0" style={{ transform: `translateY(${startIndex * lineHeight}px)` }}>
            {visibleLines.map((line) => (
              <div
                key={line.key}
                className={`font-mono text-[11px] ${lineClassName(line.type)}`}
                style={{ height: `${lineHeight}px`, lineHeight: `${lineHeight}px` }}
              >
                {line.text || "\u00A0"}
              </div>
            ))}
          </div>
        </div>
      )}
      {shouldVirtualize ? (
        <div className="sticky bottom-0 mt-2 rounded-lg border border-[var(--border-hairline)] bg-zinc-950/90 px-2 py-1.5 text-[11px] text-zinc-500">
          {t.labels.virtualizedMode}: on · {t.labels.renderedWindow}: {startIndex}-{Math.max(startIndex, endIndex - 1)}
        </div>
      ) : null}
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
