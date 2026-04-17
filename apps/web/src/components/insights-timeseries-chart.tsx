"use client";

type Point = {
  bucket: string;
  turns: number;
  success_turns: number;
  avg_latency_ms: number;
};

type Props = {
  series: Point[];
};

export function InsightsTimeseriesChart({ series }: Props) {
  if (series.length === 0) {
    return <div className="text-sm text-zinc-500">No time series data.</div>;
  }
  const width = 640;
  const height = 180;
  const maxY = Math.max(1, ...series.map((p) => p.turns));
  const points = series
    .map((p, idx) => {
      const x = (idx / Math.max(series.length - 1, 1)) * (width - 24) + 12;
      const y = height - 12 - (p.turns / maxY) * (height - 24);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[180px] min-w-[640px] w-full rounded-lg bg-black/20">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-200" />
      </svg>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-500">
        {series.slice(-8).map((p) => (
          <span key={p.bucket} className="rounded border border-[var(--border-hairline)] bg-black/20 px-1.5 py-0.5">
            {p.bucket.slice(5, 16)}: {p.turns}
          </span>
        ))}
      </div>
    </div>
  );
}
