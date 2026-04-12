"use client";

import { useCallback, useEffect, useState } from "react";

import { SessionManager } from "@/lib/session-manager";
import type { ChatSessionMeta } from "@/types";

export function useChatSession() {
  const [ready, setReady] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);

  const refreshSessions = useCallback(async () => {
    setSessions(await SessionManager.listSessions());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await SessionManager.getDb();
      let list = await SessionManager.listSessions();
      let id = list[0]?.session_id;
      if (!id) {
        id = await SessionManager.createSession();
        list = await SessionManager.listSessions();
      }
      if (cancelled) return;
      setSessionId(id);
      setSessions(list);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createSession = useCallback(async () => {
    const id = await SessionManager.createSession();
    await refreshSessions();
    setSessionId(id);
    return id;
  }, [refreshSessions]);

  const selectSession = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    await SessionManager.deleteSession(id);
    let list = await SessionManager.listSessions();
    if (list.length === 0) {
      await SessionManager.createSession();
      list = await SessionManager.listSessions();
    }
    setSessions(list);
    setSessionId((current) => {
      if (current !== id) return current;
      return list[0].session_id;
    });
  }, []);

  return {
    ready,
    sessionId,
    sessions,
    createSession,
    selectSession,
    deleteSession,
    refreshSessions,
  };
}
