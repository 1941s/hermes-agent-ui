"use client";

import { UI_TEXT } from "@hermes-ui/config/ui-text";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

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
    queryFn: async (): Promise<ReplayStats> => {
      const res = await fetch("http://localhost:8000/replay/stats");
      if (!res.ok) throw new Error("Failed to fetch replay stats");
      return res.json();
    },
    refetchInterval: 5000,
  });

  return (
    <div className="rounded border bg-zinc-950/50 p-2 text-xs text-zinc-300">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">{UI_TEXT.labels.diagnostics}</span>
        <span className="text-zinc-500">{isFetching ? "refreshing..." : "live"}</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <span>{UI_TEXT.labels.replayHits}</span>
        <span>{data?.runtime_counters?.replay_hits ?? 0}</span>
        <span>{UI_TEXT.labels.replayMisses}</span>
        <span>{data?.runtime_counters?.replay_misses ?? 0}</span>
        <span>{UI_TEXT.labels.artifactTruncated}</span>
        <span>{data?.runtime_counters?.artifact_truncated ?? 0}</span>
        <span>{UI_TEXT.labels.fps}</span>
        <span>{fps}</span>
        <span>{UI_TEXT.labels.droppedFrames}</span>
        <span>{droppedFrames}</span>
        <span>fps_avg_60s</span>
        <span>{fpsAvg60}</span>
        <span>dropped_avg_60s</span>
        <span>{dropAvg60}</span>
        <span>benchmark_sessions</span>
        <span>{data?.runtime_counters?.benchmark_sessions ?? 0}</span>
        <span>total_frames</span>
        <span>{data?.total_frames ?? 0}</span>
      </div>
      <div className="mt-2 max-h-24 overflow-auto rounded border border-zinc-800 p-1 text-[11px]">
        {(data?.top_sessions ?? []).map((s) => (
          <div key={s.session_id} className="truncate">
            {s.session_id} · {s.frame_count}
          </div>
        ))}
      </div>
    </div>
  );
}
