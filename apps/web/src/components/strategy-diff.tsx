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
    <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)] font-mono text-[12px] leading-relaxed">
      <div className="grid grid-cols-2 border-b border-[var(--border-hairline)] bg-black/30 px-3 py-2 text-[10px] uppercase tracking-wider text-zinc-500">
        <span>{d.removed}</span>
        <span>{d.added}</span>
      </div>
      <div className="grid max-h-[min(60vh,420px)] grid-cols-2 divide-x divide-[var(--border-hairline)] overflow-y-auto">
        <div className="min-w-0 space-y-0">
          {removed.length === 0 ? (
            <div className="px-3 py-3 text-zinc-600">—</div>
          ) : (
            removed.map((line, i) => (
              <pre
                key={`r-${i}`}
                className="whitespace-pre-wrap break-words border-b border-rose-500/10 bg-rose-500/10 px-3 py-1.5 text-rose-100/90 line-through decoration-rose-400/90"
              >
                {line}
              </pre>
            ))
          )}
        </div>
        <div className="min-w-0 space-y-0">
          {added.length === 0 ? (
            <div className="px-3 py-3 text-zinc-600">—</div>
          ) : (
            added.map((line, i) => (
              <pre
                key={`a-${i}`}
                className="whitespace-pre-wrap break-words border-b border-emerald-500/10 bg-emerald-500/10 px-3 py-1.5 text-emerald-100/90"
              >
                + {line}
              </pre>
            ))
          )}
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
