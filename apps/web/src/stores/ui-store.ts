"use client";

import { create } from "zustand";

type UiState = {
  traceOpen: boolean;
  setTraceOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  traceOpen: true,
  setTraceOpen: (open) => set({ traceOpen: open }),
}));
