"use client";

import type { Locale } from "@hermes-ui/config/locale-messages";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type UiState = {
  traceOpen: boolean;
  locale: Locale;
  setTraceOpen: (open: boolean) => void;
  setLocale: (locale: Locale) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      traceOpen: true,
      locale: "zh",
      setTraceOpen: (open) => set({ traceOpen: open }),
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: "hermes-ui",
      partialize: (state) => ({ locale: state.locale }),
    },
  ),
);
