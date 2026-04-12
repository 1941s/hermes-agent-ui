/**
 * Shared chat / agent types — aligned with `apps/api/schema.py` (ChatTurn, ChatSessionMeta, ConversationHistoryMessage).
 */

export type AgentFrameType =
  | "THOUGHT"
  | "TOOL_CALL"
  | "ARTIFACT"
  | "RESPONSE"
  | "HEARTBEAT"
  | "ERROR"
  | "STATUS"
  | "OPTIMIZATION"
  | "SUBAGENT"
  | "META";

/** One WebSocket frame from the agent stream (matches server `AgentFrame` JSON). */
export type AgentFrame = {
  type: AgentFrameType;
  session_id: string;
  trace_id: string;
  seq: number;
  ts: string;
  payload: Record<string, unknown>;
};

/**
 * One user round-trip: stable `turn_id` (equals `trace_id` once the server assigns it),
 * the user message text, and every agent frame belonging to that round.
 */
export type ChatTurn = {
  turn_id: string;
  user_text: string;
  frames: AgentFrame[];
};

/** IndexedDB + UI metadata for a conversation session (no turns — stored separately). */
export type ChatSessionMeta = {
  session_id: string;
  title: string;
  created_at: number;
  updated_at: number;
  preview: string;
};

/** Wire format for `WsRequest.history` — matches `ConversationHistoryMessage` in schema.py. */
export type ConversationHistoryMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};
