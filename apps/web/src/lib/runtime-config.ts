"use client";

export type RuntimeConfig = {
  modelBaseUrl: string;
  modelApiKey: string;
  modelName: string;
};

const STORAGE_KEY = "hermes.runtime.config.v1";
const CONFIG_CHANGED_EVENT = "hermes-runtime-config-changed";

const defaultModelBaseUrl = "";
const defaultModelApiKey = "";
const defaultModelName = "gpt-4o-mini";

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === "undefined") {
    return { modelBaseUrl: defaultModelBaseUrl, modelApiKey: defaultModelApiKey, modelName: defaultModelName };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { modelBaseUrl: defaultModelBaseUrl, modelApiKey: defaultModelApiKey, modelName: defaultModelName };
    const parsed = JSON.parse(raw) as Partial<RuntimeConfig>;
    return {
      modelBaseUrl: normalizeBaseUrl(parsed.modelBaseUrl ?? defaultModelBaseUrl),
      modelApiKey: typeof parsed.modelApiKey === "string" ? parsed.modelApiKey : defaultModelApiKey,
      modelName: typeof parsed.modelName === "string" && parsed.modelName.trim() ? parsed.modelName.trim() : defaultModelName,
    };
  } catch {
    return { modelBaseUrl: defaultModelBaseUrl, modelApiKey: defaultModelApiKey, modelName: defaultModelName };
  }
}

export function saveRuntimeConfig(next: RuntimeConfig): RuntimeConfig {
  const normalized: RuntimeConfig = {
    modelBaseUrl: normalizeBaseUrl(next.modelBaseUrl),
    modelApiKey: next.modelApiKey.trim(),
    modelName: next.modelName.trim() || defaultModelName,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(CONFIG_CHANGED_EVENT, { detail: normalized }));
  return normalized;
}

export function subscribeRuntimeConfigChange(onChange: (config: RuntimeConfig) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const onLocalEvent = (event: Event) => {
    const detail = (event as CustomEvent<RuntimeConfig>).detail;
    if (detail) {
      onChange(detail);
      return;
    }
    onChange(getRuntimeConfig());
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange(getRuntimeConfig());
  };

  window.addEventListener(CONFIG_CHANGED_EVENT, onLocalEvent as EventListener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(CONFIG_CHANGED_EVENT, onLocalEvent as EventListener);
    window.removeEventListener("storage", onStorage);
  };
}
