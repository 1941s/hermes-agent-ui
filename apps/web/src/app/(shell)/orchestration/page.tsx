"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { SiteChrome } from "@/components/site-chrome";
import { TaskCanvas, type GraphPayload } from "@/components/task-canvas";
import { useTranslations } from "@/hooks/use-translations";
import { apiGet, apiPost } from "@/lib/agent-api";

const DEMO_SESSION = "demo-orchestration-session";

type GraphResp = { session_id: string; revision: number; graph: GraphPayload };

type Revisions = { revisions: number[]; max_revision: number | null };

export default function OrchestrationPage() {
  const { t } = useTranslations();
  const ho = t.hub.orchestration;
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState(DEMO_SESSION);
  const [revision, setRevision] = useState<number | null>(null);

  const revQ = useQuery({
    queryKey: ["orchestration", "revisions", sessionId],
    queryFn: () => apiGet<Revisions>(`/orchestration/sessions/${encodeURIComponent(sessionId)}/graph/revisions`),
  });

  const maxRev = revQ.data?.max_revision ?? null;
  const effectiveRevision = revision ?? maxRev ?? 0;

  const graphQ = useQuery({
    queryKey: ["orchestration", "graph", sessionId, effectiveRevision],
    queryFn: () =>
      apiGet<GraphResp>(
        `/orchestration/sessions/${encodeURIComponent(sessionId)}/graph?revision=${effectiveRevision}`,
      ),
    enabled: revQ.isSuccess && maxRev !== null && maxRev >= 0,
  });

  const sliderMax = useMemo(() => Math.max(0, maxRev ?? 0), [maxRev]);

  const forkMutation = async () => {
    const res = await apiPost<{ child_session_id: string }>("/orchestration/sessions/fork", {
      parent_session_id: sessionId,
    });
    setSessionId(res.child_session_id);
    setRevision(null);
    await qc.invalidateQueries({ queryKey: ["orchestration"] });
  };

  const loadDemo = () => {
    setSessionId(DEMO_SESSION);
    setRevision(null);
    void qc.invalidateQueries({ queryKey: ["orchestration"] });
  };

  return (
    <SiteChrome>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">{ho.title}</h1>
            <p className="mt-1 text-sm text-zinc-500">{ho.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void forkMutation()}
              className="rounded-lg border border-[var(--border-hairline)] bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-zinc-100 hover:bg-white/[0.1]"
            >
              {ho.forkSession}
            </button>
            <button
              type="button"
              onClick={loadDemo}
              className="rounded-lg border border-dashed border-zinc-700 px-3 py-1.5 text-[12px] font-medium text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            >
              {ho.loadDemo}
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-zinc-400">
          <span className="text-zinc-500">{ho.sessionLabel}</span>{" "}
          <span className="font-mono text-zinc-200">{sessionId}</span>
        </div>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[12px] text-zinc-400">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">{ho.timeTravelLabel}</span>
              <input
                type="range"
                min={0}
                max={sliderMax}
                step={1}
                value={effectiveRevision}
                disabled={maxRev === null}
                onChange={(e) => setRevision(Number(e.target.value))}
                className="w-full accent-zinc-300"
              />
              <div className="flex justify-between font-mono text-[11px] text-zinc-500">
                <span>0</span>
                <span>
                  {effectiveRevision} / {sliderMax}
                </span>
              </div>
            </label>
          </div>

          {maxRev === null ? <div className="text-sm text-zinc-500">{ho.noGraphHint}</div> : null}

          {graphQ.isError ? (
            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-200">
              {(graphQ.error as Error).message}
            </div>
          ) : null}

          <TaskCanvas graph={graphQ.data?.graph ?? null} experimental />
        </section>
      </div>
    </SiteChrome>
  );
}
