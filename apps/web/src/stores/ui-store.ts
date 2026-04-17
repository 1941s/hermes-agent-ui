"use client";

import type { Locale } from "@hermes-ui/config/locale-messages";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspaceTab = "artifacts" | "reasoning" | "observability";

type UiState = {
  traceOpen: boolean;
  locale: Locale;
  sidebarCollapsed: boolean;
  chatHistoryCollapsed: boolean;
  workspaceCollapsed: boolean;
  chatHistoryWidth: number;
  workspaceWidth: number;
  workspaceTab: WorkspaceTab;
  setTraceOpen: (open: boolean) => void;
  setLocale: (locale: Locale) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setChatHistoryCollapsed: (collapsed: boolean) => void;
  setWorkspaceCollapsed: (collapsed: boolean) => void;
  setChatHistoryWidth: (width: number) => void;
  setWorkspaceWidth: (width: number) => void;
  setWorkspaceTab: (tab: WorkspaceTab) => void;
  toggleSidebarCollapsed: () => void;
  toggleChatHistoryCollapsed: () => void;
  toggleWorkspaceCollapsed: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      traceOpen: true,
      locale: "zh",
      sidebarCollapsed: false,
      chatHistoryCollapsed: false,
      workspaceCollapsed: false,
      chatHistoryWidth: 304,
      workspaceWidth: 512,
      workspaceTab: "artifacts",
      setTraceOpen: (open) => set({ traceOpen: open }),
      setLocale: (locale) => set({ locale }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setChatHistoryCollapsed: (chatHistoryCollapsed) => set({ chatHistoryCollapsed }),
      setWorkspaceCollapsed: (workspaceCollapsed) => set({ workspaceCollapsed }),
      setChatHistoryWidth: (chatHistoryWidth) => set({ chatHistoryWidth: Math.max(220, Math.min(420, chatHistoryWidth)) }),
      setWorkspaceWidth: (workspaceWidth) => set({ workspaceWidth: Math.max(320, Math.min(680, workspaceWidth)) }),
      setWorkspaceTab: (workspaceTab) => set({ workspaceTab }),
      toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      toggleChatHistoryCollapsed: () => set((s) => ({ chatHistoryCollapsed: !s.chatHistoryCollapsed })),
      toggleWorkspaceCollapsed: () => set((s) => ({ workspaceCollapsed: !s.workspaceCollapsed })),
    }),
    {
      name: "hermes-ui",
      partialize: (state) => ({
        locale: state.locale,
        sidebarCollapsed: state.sidebarCollapsed,
        chatHistoryCollapsed: state.chatHistoryCollapsed,
        workspaceCollapsed: state.workspaceCollapsed,
        chatHistoryWidth: state.chatHistoryWidth,
        workspaceWidth: state.workspaceWidth,
        workspaceTab: state.workspaceTab,
      }),
    },
  ),
);
