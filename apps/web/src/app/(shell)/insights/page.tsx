"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { SiteChrome } from "@/components/site-chrome";
import { StrategyDiff } from "@/components/strategy-diff";
import { useTranslations } from "@/hooks/use-translations";
import { apiGet, apiPost } from "@/lib/agent-api";

type OptEvent = {
  id: number;
  session_id: string | null;
  kind: string;
  removed: string[];
  added: string[];
  rationale: string | null;
  created_at: string;
};

type Metrics = {
  series: Array<{ day: string; tool_name: string; calls: number; successes: number }>;
};

type Overview = {
  turns_total: number;
  turns_success_rate: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  tool_success_rate: number;
  clarify_timeout_rate: number;
};

type Timeseries = {
  series: Array<{ bucket: string; turns: number; success_turns: number; avg_latency_ms: number }>;
};

type TopTools = {
  items: Array<{ tool_name: string; calls: number; successes: number; success_rate: number; avg_latency_ms: number }>;
};

type TraceEvents = {
  items: Array<{ id: number; seq: number; frame_type: string; created_at: string; frame: Record<string, unknown> }>;
};

type ClarifySummary = {
  total: number;
  timeout_rate: number;
  avg_wait_ms: number;
  p95_wait_ms: number;
  top_choices: Array<{ value: string; count: number }>;
};

type RuntimePolicy = { rules: string[]; total: number };
type DeriveResp = {
  candidate: { removed: string[]; added: string[]; rationale: string | null; session_id: string | null };
  has_changes?: boolean;
};

const InsightsTimeseriesChart = dynamic(
  () => import("@/components/insights-timeseries-chart").then((m) => m.InsightsTimeseriesChart),
  {
    loading: () => <div className="text-sm text-zinc-500">Loading chart...</div>,
  },
);

export default function InsightsPage() {
  const { t } = useTranslations();
  const hi = t.hub.insights;
  const [window, setWindow] = useState<"15m" | "1h" | "24h" | "7d">("24h");
  const [bucket, setBucket] = useState<"1m" | "1h">("1h");
  const [traceId, setTraceId] = useState("");
  const [submittedTraceId, setSubmittedTraceId] = useState("");
  const [candidate, setCandidate] = useState<DeriveResp["candidate"] | null>(null);
  const [busyAction, setBusyAction] = useState<"" | "derive" | "apply">("");
  const [actionMsg, setActionMsg] = useState("");
  const [rowsPage, setRowsPage] = useState(1);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [showBatchDetail, setShowBatchDetail] = useState(false);

  const eventsQ = useQuery({
    queryKey: ["insights", "optimization-events"],
    queryFn: () => apiGet<{ items: OptEvent[] }>("/insights/optimization-events"),
  });
  const metricsQ = useQuery({
    queryKey: ["insights", "metrics"],
    queryFn: () => apiGet<Metrics>("/insights/metrics?days=14"),
  });
  const overviewQ = useQuery({
    queryKey: ["insights", "overview", window],
    queryFn: () => apiGet<Overview>(`/insights/overview?window=${window}`),
  });
  const tsQ = useQuery({
    queryKey: ["insights", "timeseries", window, bucket],
    queryFn: () => apiGet<Timeseries>(`/insights/timeseries?window=${window}&bucket=${bucket}`),
  });
  const topToolsQ = useQuery({
    queryKey: ["insights", "tools-top", window],
    queryFn: () => apiGet<TopTools>(`/insights/tools/top?window=${window}&sort=failure_rate&limit=10`),
  });
  const clarifyQ = useQuery({
    queryKey: ["insights", "clarify", window],
    queryFn: () => apiGet<ClarifySummary>(`/insights/clarify?window=${window}`),
  });
  const traceQ = useQuery({
    queryKey: ["insights", "trace", submittedTraceId],
    queryFn: () => apiGet<TraceEvents>(`/insights/traces/${encodeURIComponent(submittedTraceId)}?limit=60`),
    enabled: submittedTraceId.length > 0,
  });
  const policyQ = useQuery({
    queryKey: ["insights", "optimization-policy"],
    queryFn: () => apiGet<RuntimePolicy>("/insights/optimization-policy"),
  });

  const byTool = useMemo(() => {
    const m = new Map<string, { calls: number; successes: number }>();
    for (const row of metricsQ.data?.series ?? []) {
      const cur = m.get(row.tool_name) ?? { calls: 0, successes: 0 };
      cur.calls += row.calls;
      cur.successes += row.successes;
      m.set(row.tool_name, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].calls - a[1].calls);
  }, [metricsQ.data?.series]);
  const optimizationEvents = eventsQ.data?.items ?? [];
  const eventById = useMemo(() => {
    const map = new Map<number, OptEvent>();
    for (const ev of optimizationEvents) map.set(ev.id, ev);
    return map;
  }, [optimizationEvents]);
  const detailRows = useMemo(
    () =>
      optimizationEvents.flatMap((ev) => {
        const removedRows = (ev.removed ?? []).map((line, idx) => ({
          rowId: `${ev.id}-r-${idx}`,
          batchId: ev.id,
          createdAt: ev.created_at,
          sessionId: ev.session_id,
          kind: ev.kind,
          op: "-" as const,
          content: line,
          batchSize: (ev.removed?.length ?? 0) + (ev.added?.length ?? 0),
        }));
        const addedRows = (ev.added ?? []).map((line, idx) => ({
          rowId: `${ev.id}-a-${idx}`,
          batchId: ev.id,
          createdAt: ev.created_at,
          sessionId: ev.session_id,
          kind: ev.kind,
          op: "+" as const,
          content: line,
          batchSize: (ev.removed?.length ?? 0) + (ev.added?.length ?? 0),
        }));
        return [...removedRows, ...addedRows];
      }),
    [optimizationEvents],
  );
  const ROWS_PAGE_SIZE = 12;
  const rowsTotalPages = Math.max(1, Math.ceil(detailRows.length / ROWS_PAGE_SIZE));
  const safeRowsPage = Math.min(rowsPage, rowsTotalPages);
  const rowsStart = (safeRowsPage - 1) * ROWS_PAGE_SIZE;
  const visibleRows = detailRows.slice(rowsStart, rowsStart + ROWS_PAGE_SIZE);
  const activeBatchId = selectedBatchId ?? (visibleRows[0]?.batchId ?? null);
  const activeBatch = activeBatchId != null ? eventById.get(activeBatchId) ?? null : null;

  const deriveCandidate = async () => {
    setBusyAction("derive");
    setActionMsg("");
    try {
      const resp = await apiPost<DeriveResp>("/insights/optimization-derive", { platform: "windows", auto_apply: false });
      const hasChanges = Boolean(resp.has_changes ?? ((resp.candidate.added?.length ?? 0) + (resp.candidate.removed?.length ?? 0) > 0));
      if (!hasChanges) {
        setCandidate(null);
        setActionMsg("当前没有可新增的候选规则（已是最新策略）。");
      } else {
        setCandidate(resp.candidate);
        setActionMsg("已生成 Windows 候选规则。");
      }
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "生成失败");
    } finally {
      setBusyAction("");
    }
  };

  const applyCandidate = async () => {
    if (!candidate) return;
    if ((candidate.added?.length ?? 0) + (candidate.removed?.length ?? 0) === 0) {
      setActionMsg("候选规则为空，无需应用。");
      return;
    }
    setBusyAction("apply");
    setActionMsg("");
    try {
      await apiPost("/insights/optimization-apply", {
        removed: candidate.removed,
        added: candidate.added,
        rationale: candidate.rationale,
        session_id: candidate.session_id,
      });
      setActionMsg("已应用到运行时策略。");
      setCandidate(null);
      setRowsPage(1);
      setSelectedBatchId(null);
      await Promise.all([policyQ.refetch(), eventsQ.refetch()]);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "应用失败");
    } finally {
      setBusyAction("");
    }
  };

  return (
    <SiteChrome>
      <div className="space-y-5">
        <div className="space-y-2">
          <h1 className="text-lg font-semibold text-zinc-100">{hi.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{hi.subtitle}</p>
        </div>
        <section className="sticky top-2 z-10 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-400">
            <span>{hi.windowLabel}</span>
            <select
              value={window}
              onChange={(e) => setWindow(e.target.value as "15m" | "1h" | "24h" | "7d")}
              className="rounded-md border border-[var(--border-hairline)] bg-black/20 px-2 py-1 text-zinc-200"
            >
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="24h">24h</option>
              <option value="7d">7d</option>
            </select>
            <span>{hi.bucketLabel}</span>
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value as "1m" | "1h")}
              className="rounded-md border border-[var(--border-hairline)] bg-black/20 px-2 py-1 text-zinc-200"
            >
              <option value="1m">1m</option>
              <option value="1h">1h</option>
            </select>
            <span className="ml-auto text-[11px] text-zinc-500">已生效策略: {policyQ.data?.total ?? 0}</span>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{hi.sectionOverview}</h2>
          {overviewQ.isLoading ? <div className="text-sm text-zinc-500">{hi.loading}</div> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="hermes-panel rounded-lg p-3"><div className="text-[11px] text-zinc-500">{hi.kpiTurns}</div><div className="mt-1 text-xl font-semibold text-zinc-100">{overviewQ.data?.turns_total ?? 0}</div></div>
            <div className="hermes-panel rounded-lg p-3"><div className="text-[11px] text-zinc-500">{hi.kpiTurnSuccessRate}</div><div className="mt-1 text-xl font-semibold text-zinc-100">{Math.round((overviewQ.data?.turns_success_rate ?? 0) * 100)}%</div></div>
            <div className="hermes-panel rounded-lg p-3"><div className="text-[11px] text-zinc-500">{hi.kpiP50}</div><div className="mt-1 text-xl font-semibold text-zinc-100">{overviewQ.data?.latency_p50_ms ?? 0}ms</div></div>
            <div className="hermes-panel rounded-lg p-3"><div className="text-[11px] text-zinc-500">{hi.kpiP95}</div><div className="mt-1 text-xl font-semibold text-zinc-100">{overviewQ.data?.latency_p95_ms ?? 0}ms</div></div>
            <div className="hermes-panel rounded-lg p-3"><div className="text-[11px] text-zinc-500">{hi.kpiToolSuccessRate}</div><div className="mt-1 text-xl font-semibold text-zinc-100">{Math.round((overviewQ.data?.tool_success_rate ?? 0) * 100)}%</div></div>
            <div className="hermes-panel rounded-lg p-3"><div className="text-[11px] text-zinc-500">{hi.kpiClarifyTimeoutRate}</div><div className="mt-1 text-xl font-semibold text-zinc-100">{Math.round((overviewQ.data?.clarify_timeout_rate ?? 0) * 100)}%</div></div>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <section className="space-y-3">
              <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{hi.sectionTimeseries}</h2>
              {tsQ.isLoading ? <div className="text-sm text-zinc-500">{hi.loading}</div> : null}
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-3">
                <InsightsTimeseriesChart series={tsQ.data?.series ?? []} />
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{hi.sectionToolsTop}</h2>
              {topToolsQ.isLoading ? <div className="text-sm text-zinc-500">{hi.loading}</div> : null}
              <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)]">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead className="border-b border-[var(--border-hairline)] bg-black/25 text-[10px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">{hi.tableTool}</th>
                      <th className="px-3 py-2 font-medium">{hi.tableCalls}</th>
                      <th className="px-3 py-2 font-medium">{hi.tableSuccessRate}</th>
                      <th className="px-3 py-2 font-medium">{hi.tableAvgLatency}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(topToolsQ.data?.items ?? []).map((row) => (
                      <tr key={row.tool_name} className="border-b border-[var(--border-hairline)]/60">
                        <td className="px-3 py-2 font-mono text-zinc-200">{row.tool_name}</td>
                        <td className="px-3 py-2 tabular-nums text-zinc-300">{row.calls}</td>
                        <td className="px-3 py-2 tabular-nums text-zinc-300">{Math.round(row.success_rate * 100)}%</td>
                        <td className="px-3 py-2 tabular-nums text-zinc-300">{row.avg_latency_ms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

          </div>

          <div className="space-y-4">
            <section className="space-y-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-3">
              <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{hi.sectionTraceDrilldown}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={traceId}
                  onChange={(e) => setTraceId(e.target.value)}
                  placeholder={hi.traceIdLabel}
                  className="hermes-input min-w-[260px] flex-1 rounded-md border border-[var(--border-hairline)] bg-black/20 px-3 py-2 text-[12px] text-zinc-200"
                />
                <button
                  type="button"
                  onClick={() => setSubmittedTraceId(traceId.trim())}
                  className="rounded-md border border-[var(--border-hairline)] bg-white/[0.06] px-3 py-2 text-[12px] text-zinc-100 hover:bg-white/[0.1]"
                >
                  {hi.loadTrace}
                </button>
              </div>
              {traceQ.isLoading ? <div className="text-sm text-zinc-500">{hi.loading}</div> : null}
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {(traceQ.data?.items ?? []).map((ev) => (
                  <div key={ev.id} className="rounded-md border border-[var(--border-hairline)] bg-black/20 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                      <span>#{ev.seq}</span>
                      <span className="font-mono">{ev.frame_type}</span>
                      <span>{ev.created_at}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-3">
              <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{hi.sectionClarify}</h2>
              {clarifyQ.isLoading ? <div className="text-sm text-zinc-500">{hi.loading}</div> : null}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="hermes-panel rounded-lg p-3">
                  <div className="text-[11px] text-zinc-500">Total</div>
                  <div className="mt-1 text-xl font-semibold text-zinc-100">{clarifyQ.data?.total ?? 0}</div>
                </div>
                <div className="hermes-panel rounded-lg p-3">
                  <div className="text-[11px] text-zinc-500">{hi.kpiClarifyTimeoutRate}</div>
                  <div className="mt-1 text-xl font-semibold text-zinc-100">
                    {Math.round((clarifyQ.data?.timeout_rate ?? 0) * 100)}%
                  </div>
                </div>
                <div className="hermes-panel rounded-lg p-3">
                  <div className="text-[11px] text-zinc-500">P95 wait</div>
                  <div className="mt-1 text-xl font-semibold text-zinc-100">{clarifyQ.data?.p95_wait_ms ?? 0}ms</div>
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-3">
              <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{hi.sectionToolMetrics}</h2>
              {metricsQ.isLoading ? <div className="text-sm text-zinc-500">{hi.loading}</div> : null}
              <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-black/20">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead className="border-b border-[var(--border-hairline)] bg-black/25 text-[10px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">{hi.tableTool}</th>
                      <th className="px-3 py-2 font-medium">{hi.tableCalls}</th>
                      <th className="px-3 py-2 font-medium">{hi.tableSuccesses}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byTool.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-zinc-500" colSpan={3}>
                          {hi.emptyMetrics}
                        </td>
                      </tr>
                    ) : (
                      byTool.map(([name, v]) => (
                        <tr key={name} className="border-b border-[var(--border-hairline)]/60">
                          <td className="px-3 py-2 font-mono text-zinc-200">{name}</td>
                          <td className="px-3 py-2 tabular-nums text-zinc-300">{v.calls}</td>
                          <td className="px-3 py-2 tabular-nums text-zinc-300">{v.successes}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{hi.sectionOptimizationLog}</h2>
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void deriveCandidate()}
                disabled={busyAction !== ""}
                className="rounded-md border border-[var(--border-hairline)] bg-white/[0.06] px-3 py-1.5 text-[12px] text-zinc-100 hover:bg-white/[0.1] disabled:opacity-50"
              >
                生成 Windows 候选规则
              </button>
              <button
                type="button"
                onClick={() => void applyCandidate()}
                disabled={busyAction !== "" || !candidate || (candidate.added.length + candidate.removed.length === 0)}
                className="rounded-md border border-emerald-500/35 bg-emerald-500/15 px-3 py-1.5 text-[12px] text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                应用候选规则
              </button>
              {actionMsg ? <span className="text-[12px] text-zinc-300">{actionMsg}</span> : null}
            </div>
            {candidate ? (
              <div className="mb-3 rounded-lg border border-[var(--border-hairline)] bg-black/20 p-2">
                <StrategyDiff removed={candidate.removed} added={candidate.added} rationale={candidate.rationale} />
              </div>
            ) : null}
            {eventsQ.isLoading ? <div className="text-sm text-zinc-500">{hi.loading}</div> : null}
            {visibleRows.length === 0 ? (
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] px-3 py-6 text-center text-[12px] text-zinc-500">
                暂无优化日志
              </div>
            ) : (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)]">
                  <table className="w-full border-collapse text-left text-[12px]">
                    <thead className="border-b border-[var(--border-hairline)] bg-black/25 text-[10px] uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 font-medium">批次</th>
                        <th className="px-3 py-2 font-medium">时间</th>
                        <th className="px-3 py-2 font-medium">操作</th>
                        <th className="px-3 py-2 font-medium">规则内容</th>
                        <th className="px-3 py-2 font-medium">会话</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr
                          key={row.rowId}
                          className={`border-b border-[var(--border-hairline)]/60 align-top ${
                            row.batchId === activeBatchId ? "bg-white/[0.03]" : ""
                          }`}
                        >
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setSelectedBatchId(row.batchId)}
                              className="rounded border border-[var(--border-hairline)] bg-black/20 px-2 py-0.5 font-mono text-[11px] text-zinc-300 hover:bg-white/[0.06]"
                              title={`同批共 ${row.batchSize} 条`}
                            >
                              #{row.batchId}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-zinc-300">{row.createdAt}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                                row.op === "+" ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"
                              }`}
                            >
                              {row.op}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-zinc-200">{row.content}</td>
                          <td className="px-3 py-2 text-zinc-400">{row.sessionId ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {activeBatch ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowBatchDetail((prev) => !prev)}
                      className="rounded-md border border-[var(--border-hairline)] bg-white/[0.04] px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-white/[0.08]"
                    >
                      {showBatchDetail ? "隐藏批次详情" : `查看批次 #${activeBatch.id} 详情`}
                    </button>
                    {showBatchDetail ? (
                      <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-3">
                        <div className="mb-2 text-[11px] text-zinc-500">
                          批次 #{activeBatch.id} · {activeBatch.kind} · 同批 {(activeBatch.removed.length + activeBatch.added.length)} 条
                        </div>
                        <StrategyDiff removed={activeBatch.removed} added={activeBatch.added} rationale={activeBatch.rationale} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex items-center justify-between text-[12px] text-zinc-400">
                  <span>
                    第 {safeRowsPage} / {rowsTotalPages} 页 · 共 {detailRows.length} 条规则变更
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={safeRowsPage <= 1}
                      onClick={() => setRowsPage((p) => Math.max(1, p - 1))}
                      className="rounded-md border border-[var(--border-hairline)] bg-white/[0.04] px-3 py-1 disabled:opacity-40"
                    >
                      上一页
                    </button>
                    <button
                      type="button"
                      disabled={safeRowsPage >= rowsTotalPages}
                      onClick={() => setRowsPage((p) => Math.min(rowsTotalPages, p + 1))}
                      className="rounded-md border border-[var(--border-hairline)] bg-white/[0.04] px-3 py-1 disabled:opacity-40"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {eventsQ.isError ? (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-200">
            {(eventsQ.error as Error).message}
          </div>
        ) : null}
      </div>
    </SiteChrome>
  );
}
