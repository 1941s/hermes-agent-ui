"use client";

type Props = {
  /** Shown next to the animated dots (e.g. localized “推理中”). */
  label: string;
  /** Tighter layout when shown under existing assistant text (ChatGPT / Perplexity style footer). */
  compact?: boolean;
};

/**
 * “Big model” style thinking affordance: label + three staggered dots (no empty bubble).
 */
export function ThinkingIndicator({ label, compact }: Props) {
  return (
    <div
      className={`flex items-center gap-2.5 ${compact ? "text-[12px]" : "text-[13px]"}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className={`font-medium text-zinc-300 ${compact ? "text-[12px]" : "text-[13px]"}`}>{label}</span>
      <span className="flex items-center gap-1.5" aria-hidden>
        <span className="hermes-thinking-dot" />
        <span className="hermes-thinking-dot hermes-thinking-dot-d1" />
        <span className="hermes-thinking-dot hermes-thinking-dot-d2" />
      </span>
    </div>
  );
}
