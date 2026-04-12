import type { AgentFrame, ChatTurn, ConversationHistoryMessage } from "@/types";

/** Pending user turns use this prefix until the first server frame supplies `trace_id`. */
export const PENDING_TURN_PREFIX = "pending:";

export function aggregateAssistantFromFrames(frames: AgentFrame[]): string {
  let out = "";
  for (const f of frames) {
    if (f.type !== "RESPONSE") continue;
    out += String((f.payload as { content?: unknown }).content ?? "");
  }
  return out;
}

/**
 * True when assistant output is not finished: no RESPONSE yet, or last RESPONSE has `final !== true`.
 * Used to show “still working” UI while tokens stream or tools run between chunks.
 */
export function isAssistantReplyInFlight(frames: AgentFrame[]): boolean {
  const responses = frames.filter((f) => f.type === "RESPONSE");
  if (responses.length === 0) return true;
  const last = responses[responses.length - 1];
  return !Boolean((last.payload as { final?: unknown }).final);
}

/** Append a streamed frame into `turns`, pairing by `trace_id` or the next pending turn (FIFO). */
export function appendFrameToTurns(turns: ChatTurn[], frame: AgentFrame): ChatTurn[] {
  const next = turns.map((t) => ({
    ...t,
    frames: [...t.frames],
  }));

  const byTrace = next.findIndex((t) => t.turn_id === frame.trace_id);
  if (byTrace >= 0) {
    next[byTrace].frames.push(frame);
    return next;
  }

  const pendingIdx = next.findIndex((t) => t.turn_id.startsWith(PENDING_TURN_PREFIX));
  if (pendingIdx >= 0) {
    const t = next[pendingIdx];
    next[pendingIdx] = {
      turn_id: frame.trace_id,
      user_text: t.user_text,
      frames: [...t.frames, frame],
    };
    return next;
  }

  next.push({
    turn_id: frame.trace_id,
    user_text: "",
    frames: [frame],
  });
  return next;
}

/**
 * Build the last `maxTurns` completed dialogue rounds for `WsRequest.history`.
 * Excludes pending (unbound) turns and the message about to be sent.
 */
export function buildHistoryFromTurns(turns: ChatTurn[], maxTurns: number): ConversationHistoryMessage[] {
  const completed = turns.filter(
    (t) => !t.turn_id.startsWith(PENDING_TURN_PREFIX) && t.user_text.trim().length > 0,
  );
  const slice = completed.slice(-maxTurns);
  const out: ConversationHistoryMessage[] = [];
  for (const t of slice) {
    out.push({ role: "user", content: t.user_text });
    const assistant = aggregateAssistantFromFrames(t.frames).trimEnd();
    if (assistant.length > 0) {
      out.push({ role: "assistant", content: assistant });
    }
  }
  return out;
}

export function maxSeqFromTurns(turns: ChatTurn[]): number {
  let max = -1;
  for (const t of turns) {
    for (const f of t.frames) {
      if (typeof f.seq === "number" && f.seq > max) max = f.seq;
    }
  }
  return max;
}

export function flattenFramesFromTurns(turns: ChatTurn[]): AgentFrame[] {
  const flat = turns.flatMap((t) => t.frames);
  return [...flat].sort((a, b) => a.seq - b.seq);
}
