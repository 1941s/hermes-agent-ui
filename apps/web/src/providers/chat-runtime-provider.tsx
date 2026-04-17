"use client";

import { createContext, useContext, useMemo } from "react";

import { useAgent } from "@/hooks/use-agent";
import { useChatSession } from "@/hooks/use-chat-session";

const WS_URL = process.env.NEXT_PUBLIC_AGENT_WS_URL ?? "ws://localhost:8000/ws/agent";

type ChatRuntimeValue = ReturnType<typeof useChatSession> & ReturnType<typeof useAgent>;

const ChatRuntimeContext = createContext<ChatRuntimeValue | null>(null);

export function ChatRuntimeProvider({ children }: { children: React.ReactNode }) {
  const session = useChatSession();
  const agent = useAgent(WS_URL, { sessionId: session.sessionId });

  const value = useMemo(
    () => ({
      ...session,
      ...agent,
    }),
    [session, agent],
  );

  return <ChatRuntimeContext.Provider value={value}>{children}</ChatRuntimeContext.Provider>;
}

export function useChatRuntime(): ChatRuntimeValue {
  const ctx = useContext(ChatRuntimeContext);
  if (!ctx) {
    throw new Error("useChatRuntime must be used inside ChatRuntimeProvider");
  }
  return ctx;
}
