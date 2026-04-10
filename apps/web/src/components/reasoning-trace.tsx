"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { UI_TEXT } from "@hermes-ui/config/ui-text";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AgentFrame } from "@/hooks/use-agent";

type Props = {
  frames: AgentFrame[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const VIRTUALIZATION_THRESHOLD_LINES = 500;
const BASE_LINE_HEIGHT = 18;
const OVERSCAN_LINES = 30;
const STICKY_BOTTOM_THRESHOLD_PX = 48;

type TraceLine = {
  key: string;
  text: string;
  type: AgentFrame["type"];
};

export function ReasoningTrace({ frames, open, onOpenChange }: Props) {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

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
  const viewportHeight = 360;
  const totalHeight = traceLines.length * lineHeight;
  const startIndex = shouldVirtualize ? Math.max(0, Math.floor(scrollTop / lineHeight) - OVERSCAN_LINES) : 0;
  const visibleCount = shouldVirtualize ? Math.ceil(viewportHeight / lineHeight) + OVERSCAN_LINES * 2 : traceLines.length;
  const endIndex = Math.min(traceLines.length, startIndex + visibleCount);
  const visibleLines = shouldVirtualize ? traceLines.slice(startIndex, endIndex) : traceLines;

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !isAtBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [frames, isAtBottom]);

  const lineClassName = (type: AgentFrame["type"]): string => {
    if (type === "THOUGHT") return "text-indigo-100";
    if (type === "TOOL_CALL") return "text-emerald-100";
    return "text-zinc-200";
  };

  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange} className="rounded-xl border bg-zinc-950/40">
      <Collapsible.Trigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
        <span>{UI_TEXT.panes.reasoning}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </Collapsible.Trigger>
      <Collapsible.Content className="border-t">
        <div
          ref={scrollContainerRef}
          className="max-h-[360px] overflow-y-auto p-3"
          onScroll={(e) => {
            const nextTop = e.currentTarget.scrollTop;
            if (shouldVirtualize) setScrollTop(nextTop);
            const remaining = e.currentTarget.scrollHeight - (nextTop + e.currentTarget.clientHeight);
            setIsAtBottom(remaining <= STICKY_BOTTOM_THRESHOLD_PX);
          }}
        >
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
                    className={`mb-2 rounded-lg px-3 py-2 text-xs ${
                      isThought ? "bg-indigo-500/15 text-indigo-100" : isTool ? "bg-emerald-500/15 text-emerald-100" : "bg-zinc-900 text-zinc-200"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      {isTool ? <Wrench className="h-3.5 w-3.5" /> : null}
                      <span className="font-semibold">{frame.type}</span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words">
                      {JSON.stringify(frame.payload, null, 2)}
                    </pre>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          ) : (
            <div className="relative" style={{ height: `${totalHeight}px` }}>
              <div
                className="absolute left-0 right-0"
                style={{ transform: `translateY(${startIndex * lineHeight}px)` }}
              >
                {visibleLines.map((line) => (
                  <div
                    key={line.key}
                    className={`font-mono text-xs ${lineClassName(line.type)}`}
                    style={{ height: `${lineHeight}px`, lineHeight: `${lineHeight}px` }}
                  >
                    {line.text || "\u00A0"}
                  </div>
                ))}
              </div>
            </div>
          )}
          {shouldVirtualize ? (
            <div className="sticky bottom-0 mt-2 rounded border border-zinc-700/60 bg-zinc-900/80 px-2 py-1 text-[11px] text-zinc-400">
              {UI_TEXT.labels.virtualizedMode}: on · {UI_TEXT.labels.renderedWindow}: {startIndex}-{Math.max(startIndex, endIndex - 1)}
            </div>
          ) : null}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
