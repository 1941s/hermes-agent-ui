"use client";

import { messages, type Locale } from "@hermes-ui/config/locale-messages";
import { useUiStore } from "@/stores/ui-store";

export function useTranslations() {
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  const t = messages[locale];
  return { t, locale, setLocale };
}

export type { Locale };
