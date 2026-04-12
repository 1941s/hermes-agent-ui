import type { AgentFrame } from "@/types";

export type ClarifyPrompt = {
  question: string;
  choices: string[];
  /** Seq of this TOOL_CALL (when multiple clarifies exist, we use the latest by seq). */
  seq: number;
  /** True when `result` parses as JSON with an `error` field (e.g. tool not registered). */
  hasToolError: boolean;
};

function parseResultError(result: unknown): boolean {
  if (typeof result !== "string" || !result.trim()) return false;
  try {
    const j = JSON.parse(result) as { error?: unknown };
    if (j == null || typeof j !== "object") return false;
    if (!("error" in j)) return false;
    const err = j.error;
    if (err === undefined || err === null) return false;
    if (typeof err === "boolean" && err === false) return false;
    if (typeof err === "string" && !err.trim()) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract a clarify-style interactive prompt from TOOL_CALL frames (question + choices[]).
 * Works even when the tool returns an error — args are still present for UI.
 */
export function extractClarifyFromFrames(frames: AgentFrame[]): ClarifyPrompt | null {
  let best: ClarifyPrompt | null = null;

  for (const f of frames) {
    if (f.type !== "TOOL_CALL") continue;
    const p = f.payload as {
      name?: string;
      args?: unknown;
      result?: unknown;
    };
    const args = p.args as { question?: unknown; choices?: unknown } | null | undefined;
    if (!args || typeof args !== "object") continue;

    const question = typeof args.question === "string" ? args.question.trim() : "";
    const rawChoices = args.choices;
    const choices = Array.isArray(rawChoices)
      ? rawChoices.map((c) => (typeof c === "string" ? c.trim() : "")).filter(Boolean)
      : [];

    if (question.length === 0 || choices.length < 2) continue;

    const hasToolError = parseResultError(p.result);
    const candidate: ClarifyPrompt = {
      question,
      choices,
      seq: f.seq,
      hasToolError,
    };

    if (!best || f.seq > best.seq) {
      best = candidate;
    }
  }

  return best;
}

/** Stable key for "user already answered this clarify in UI". */
export function clarifySessionKey(turnId: string, prompt: ClarifyPrompt): string {
  return `${turnId}:${prompt.seq}:${prompt.question.slice(0, 80)}`;
}
