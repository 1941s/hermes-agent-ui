"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { SiteChrome } from "@/components/site-chrome";
import { StrategyDiff } from "@/components/strategy-diff";
import { useTranslations } from "@/hooks/use-translations";
import { apiGet } from "@/lib/agent-api";

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

export default function InsightsPage() {
  const { t } = useTranslations();
  const hi = t.hub.insights;

  const eventsQ = useQuery({
    queryKey: ["insights", "optimization-events"],
    queryFn: () => apiGet<{ items: OptEvent[] }>("/insights/optimization-events"),
  });
  const metricsQ = useQuery({
    queryKey: ["insights", "metrics"],
    queryFn: () => apiGet<Metrics>("/insights/metrics?days=14"),
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

  return (
    <SiteChrome>
      <div className="space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">{hi.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{hi.subtitle}</p>
        </div>

        {eventsQ.isError ? (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-200">
            {(eventsQ.error as Error).message}
          </div>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{hi.sectionOptimizationLog}</h2>
          {eventsQ.isLoading ? <div className="text-sm text-zinc-500">{hi.loading}</div> : null}
          <div className="space-y-6">
            {(eventsQ.data?.items ?? []).map((ev) => (
              <div key={ev.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <span className="rounded border border-[var(--border-hairline)] bg-black/20 px-2 py-0.5 font-mono">
                    {ev.kind}
                  </span>
                  <span>{ev.created_at}</span>
                  {ev.session_id ? (
                    <span>
                      {hi.sessionPrefix}: {ev.session_id}
                    </span>
                  ) : null}
                </div>
                <StrategyDiff removed={ev.removed} added={ev.added} rationale={ev.rationale} />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{hi.sectionToolMetrics}</h2>
          {metricsQ.isLoading ? <div className="text-sm text-zinc-500">{hi.loading}</div> : null}
          <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)]">
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
    </SiteChrome>
  );
}
