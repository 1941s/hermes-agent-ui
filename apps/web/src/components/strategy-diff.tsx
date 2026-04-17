"use client";

import { useTranslations } from "@/hooks/use-translations";

type Props = {
  removed: string[];
  added: string[];
  rationale?: string | null;
};

export function StrategyDiff({ removed, added, rationale }: Props) {
  const { t } = useTranslations();
  const d = t.hub.strategyDiff;
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] text-[12px] leading-relaxed">
      <div className="flex items-center justify-between border-b border-[var(--border-hairline)] bg-black/30 px-3 py-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Rule Diff</span>
        <span className="text-[11px] text-zinc-500">
          -{removed.length} / +{added.length}
        </span>
      </div>
      <div className="max-h-[min(52vh,420px)] space-y-3 overflow-y-auto p-3">
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-rose-300/90">{d.removed}</div>
          {removed.length === 0 ? <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2 text-zinc-600">—</div> : null}
          {removed.map((line, i) => (
            <div key={`r-${i}`} className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-2 text-rose-100/90">
              <span className="mr-1 text-rose-300">-</span>
              <span className="break-words line-through decoration-rose-300/90">{line}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-emerald-300/90">{d.added}</div>
          {added.length === 0 ? <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2 text-zinc-600">—</div> : null}
          {added.map((line, i) => (
            <div key={`a-${i}`} className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-2 text-emerald-100/90">
              <span className="mr-1 text-emerald-300">+</span>
              <span className="break-words">{line}</span>
            </div>
          ))}
        </div>
      </div>
      {rationale ? (
        <div className="border-t border-[var(--border-hairline)] px-3 py-2 text-[11px] text-zinc-500">
          <span className="font-medium text-zinc-400">{d.rationale}</span> — {rationale}
        </div>
      ) : null}
    </div>
  );
}
