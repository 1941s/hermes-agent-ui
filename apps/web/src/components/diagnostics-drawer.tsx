"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useTranslations } from "@/hooks/use-translations";
import { apiGet } from "@/lib/agent-api";

type ReplayStats = {
  runtime_counters?: {
    replay_hits?: number;
    replay_misses?: number;
    artifact_truncated?: number;
    benchmark_sessions?: number;
  };
  total_frames?: number;
  total_sessions?: number;
  top_sessions?: Array<{
    session_id: string;
    frame_count: number;
    last_seen_at: string;
  }>;
};

export function DiagnosticsDrawer() {
  const { t } = useTranslations();
  const [fps, setFps] = useState<number>(0);
  const [droppedFrames, setDroppedFrames] = useState<number>(0);
  const [fpsAvg60, setFpsAvg60] = useState<number>(0);
  const [dropAvg60, setDropAvg60] = useState<number>(0);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    let rafId = 0;
    let lastTs = performance.now();
    let frameCount = 0;
    let secondWindowStart = performance.now();
    let dropped = 0;
    const fpsWindow: number[] = [];
    const droppedWindow: number[] = [];

    const tick = (ts: number) => {
      frameCount += 1;
      const delta = ts - lastTs;
      if (delta > 20) {
        dropped += Math.floor(delta / 16.67) - 1;
      }
      lastTs = ts;

      if (ts - secondWindowStart >= 1000) {
        setFps(frameCount);
        setDroppedFrames((prev) => prev + dropped);
        fpsWindow.push(frameCount);
        droppedWindow.push(dropped);
        if (fpsWindow.length > 60) fpsWindow.shift();
        if (droppedWindow.length > 60) droppedWindow.shift();
        const fpsAvg = fpsWindow.reduce((a, b) => a + b, 0) / Math.max(1, fpsWindow.length);
        const dropAvg = droppedWindow.reduce((a, b) => a + b, 0) / Math.max(1, droppedWindow.length);
        setFpsAvg60(Math.round(fpsAvg));
        setDropAvg60(Math.round(dropAvg));
        frameCount = 0;
        dropped = 0;
        secondWindowStart = ts;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["replay-stats"],
    queryFn: () => apiGet<ReplayStats>("/replay/stats"),
    refetchInterval: 5000,
  });

  const topSessions = data?.top_sessions ?? [];
  const showFpsTiles = process.env.NODE_ENV === "development";

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-black/20 px-3 py-2.5 text-[11px] text-zinc-400">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-zinc-300">{t.labels.diagnostics}</span>
        <span className="text-zinc-600">{isFetching ? t.labels.refreshing : t.labels.live}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px]">
        <span>{t.labels.replayHits}</span>
        <span className="text-right text-zinc-300">{data?.runtime_counters?.replay_hits ?? 0}</span>
        <span>{t.labels.replayMisses}</span>
        <span className="text-right text-zinc-300">{data?.runtime_counters?.replay_misses ?? 0}</span>
        <span>{t.labels.artifactTruncated}</span>
        <span className="text-right text-zinc-300">{data?.runtime_counters?.artifact_truncated ?? 0}</span>
        {showFpsTiles ? (
          <>
            <span>{t.labels.fps}</span>
            <span className="text-right text-zinc-300">{fps}</span>
            <span>{t.labels.droppedFrames}</span>
            <span className="text-right text-zinc-300">{droppedFrames}</span>
            <span>{t.labels.fpsAvg60}</span>
            <span className="text-right text-zinc-300">{fpsAvg60}</span>
            <span>{t.labels.droppedAvg60}</span>
            <span className="text-right text-zinc-300">{dropAvg60}</span>
          </>
        ) : null}
        <span>{t.labels.benchmarkSessions}</span>
        <span className="text-right text-zinc-300">{data?.runtime_counters?.benchmark_sessions ?? 0}</span>
        <span>{t.labels.totalFrames}</span>
        <span className="text-right text-zinc-300">{data?.total_frames ?? 0}</span>
      </div>
      {topSessions.length > 0 ? (
        <div className="mt-2 max-h-24 overflow-auto rounded-lg border border-white/[0.06] p-1.5 text-[10px] font-mono">
          {topSessions.map((s) => (
            <div key={s.session_id} className="truncate text-zinc-500">
              {s.session_id} · {s.frame_count}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
