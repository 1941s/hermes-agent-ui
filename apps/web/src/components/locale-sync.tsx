"use client";

import { useEffect } from "react";

import type { Locale } from "@hermes-ui/config/locale-messages";
import { useUiStore } from "@/stores/ui-store";

const htmlLang: Record<Locale, string> = {
  zh: "zh-CN",
  en: "en",
};

export function LocaleSync() {
  const locale = useUiStore((s) => s.locale);

  useEffect(() => {
    document.documentElement.lang = htmlLang[locale];
  }, [locale]);

  return null;
}
