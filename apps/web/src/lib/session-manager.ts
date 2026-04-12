import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { ChatSessionMeta, ChatTurn } from "@/types";

const DB_NAME = "hermes-ui";
const DB_VERSION = 1;

export type SessionTurnsRow = {
  session_id: string;
  turns: ChatTurn[];
};

interface HermesDBSchema extends DBSchema {
  sessions: {
    key: string;
    value: ChatSessionMeta;
  };
  turns: {
    key: string;
    value: SessionTurnsRow;
  };
}

let dbPromise: Promise<IDBPDatabase<HermesDBSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<HermesDBSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<HermesDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("sessions")) {
          database.createObjectStore("sessions", { keyPath: "session_id" });
        }
        if (!database.objectStoreNames.contains("turns")) {
          database.createObjectStore("turns", { keyPath: "session_id" });
        }
      },
    });
  }
  return dbPromise;
}

function newSessionId(): string {
  return `sess_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export const SessionManager = {
  async getDb(): Promise<IDBPDatabase<HermesDBSchema>> {
    return getDb();
  },

  async listSessions(): Promise<ChatSessionMeta[]> {
    const db = await getDb();
    const all = await db.getAll("sessions");
    return [...all].sort((a, b) => b.updated_at - a.updated_at);
  },

  async getSession(sessionId: string): Promise<ChatSessionMeta | undefined> {
    const db = await getDb();
    return db.get("sessions", sessionId);
  },

  async upsertSession(meta: ChatSessionMeta): Promise<void> {
    const db = await getDb();
    await db.put("sessions", meta);
  },

  async deleteSession(sessionId: string): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(["sessions", "turns"], "readwrite");
    await tx.objectStore("sessions").delete(sessionId);
    await tx.objectStore("turns").delete(sessionId);
    await tx.done;
  },

  async getTurns(sessionId: string): Promise<ChatTurn[]> {
    const db = await getDb();
    const row = await db.get("turns", sessionId);
    return row?.turns ?? [];
  },

  async putTurns(sessionId: string, turns: ChatTurn[]): Promise<void> {
    const db = await getDb();
    await db.put("turns", { session_id: sessionId, turns });
  },

  /** Create session row + empty turns. */
  async createSession(): Promise<string> {
    const session_id = newSessionId();
    const now = Date.now();
    await this.upsertSession({
      session_id,
      title: "New chat",
      preview: "",
      created_at: now,
      updated_at: now,
    });
    await this.putTurns(session_id, []);
    return session_id;
  },

  /**
   * Derive title / preview / timestamps from turns and persist metadata.
   */
  async touchSessionFromTurns(sessionId: string, turns: ChatTurn[]): Promise<void> {
    const prev = await this.getSession(sessionId);
    const now = Date.now();
    const firstUser = turns.find((t) => t.user_text.trim())?.user_text ?? "";
    const { aggregateAssistantFromFrames } = await import("@/lib/conversation-history");
    let title = prev?.title ?? "New chat";
    if (firstUser.length > 0 && (title === "New chat" || !title.trim())) {
      title = firstUser.length > 48 ? `${firstUser.slice(0, 45)}…` : firstUser;
    }
    let preview = "";
    for (let i = turns.length - 1; i >= 0; i--) {
      const a = aggregateAssistantFromFrames(turns[i].frames).trim();
      if (a) {
        preview = a.length > 120 ? `${a.slice(0, 117)}…` : a;
        break;
      }
    }
    if (!preview && firstUser) {
      preview = firstUser.length > 120 ? `${firstUser.slice(0, 117)}…` : firstUser;
    }
    await this.upsertSession({
      session_id: sessionId,
      title,
      preview,
      created_at: prev?.created_at ?? now,
      updated_at: now,
    });
  },
};
