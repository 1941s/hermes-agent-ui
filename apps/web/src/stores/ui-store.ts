"use client";

import type { Locale } from "@hermes-ui/config/locale-messages";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiState = {
  traceOpen: boolean;
  locale: Locale;
  sidebarCollapsed: boolean;
  setTraceOpen: (open: boolean) => void;
  setLocale: (locale: Locale) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      traceOpen: true,
      locale: "zh",
      sidebarCollapsed: false,
      setTraceOpen: (open) => set({ traceOpen: open }),
      setLocale: (locale) => set({ locale }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "hermes-ui",
      partialize: (state) => ({ locale: state.locale, sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
