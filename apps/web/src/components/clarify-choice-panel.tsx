"use client";

import { CheckCircle2, ListChecks } from "lucide-react";

import type { ClarifyPrompt } from "@/lib/clarify-from-frames";

type Props = {
  prompt: ClarifyPrompt;
  disabled?: boolean;
  answeredChoice?: string | null;
  onSelect: (choice: string) => void;
  labels: {
    clarifyPickOne: string;
    clarifyFallbackHint: string;
    clarifyYourChoice: string;
  };
};

export function ClarifyChoicePanel({ prompt, disabled, answeredChoice, onSelect, labels }: Props) {
  const answered = Boolean(answeredChoice);
  const locked = answered || disabled;

  return (
    <div
      className="mb-4 w-full max-w-[min(100%,92%)] overflow-hidden rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-950/40 via-zinc-900/50 to-zinc-950/80 shadow-[0_0_0_1px_rgba(56,189,248,0.06)]"
      role="group"
      aria-label={labels.clarifyPickOne}
    >
      <div className="flex items-start gap-2 border-b border-white/[0.06] px-4 py-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300">
          <ListChecks className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-sky-400/90">{labels.clarifyPickOne}</p>
          <p className="mt-1 text-[15px] leading-snug text-zinc-100">{prompt.question}</p>
          {prompt.hasToolError ? (
            <p className="mt-2 text-[12px] leading-relaxed text-amber-200/85">{labels.clarifyFallbackHint}</p>
          ) : null}
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 p-3">
        {prompt.choices.map((choice) => {
          const isAnswered = answeredChoice === choice;
          return (
            <li key={choice}>
              <button
                type="button"
                disabled={locked}
                onClick={() => onSelect(choice)}
                className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[14px] leading-snug transition ${
                  isAnswered
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                    : answered
                      ? "cursor-not-allowed border-white/[0.04] text-zinc-600"
                      : "border-white/[0.08] bg-black/20 text-zinc-200 hover:border-sky-500/35 hover:bg-sky-500/10 hover:text-zinc-50"
                }`}
              >
                {isAnswered ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                ) : (
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                )}
                <span className="min-w-0 flex-1">{choice}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {answeredChoice ? (
        <div className="border-t border-white/[0.06] px-4 py-2.5 text-[12px] text-zinc-500">
          <span className="text-zinc-400">{labels.clarifyYourChoice}</span>{" "}
          <span className="text-zinc-300">{answeredChoice}</span>
        </div>
      ) : null}
    </div>
  );
}
