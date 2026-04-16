"use client";

import { Check, KeyRound, RotateCcw, Save, Server, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { SiteChrome } from "@/components/site-chrome";
import { useTranslations } from "@/hooks/use-translations";
import { apiPost } from "@/lib/agent-api";
import { getRuntimeConfig, saveRuntimeConfig, type RuntimeConfig } from "@/lib/runtime-config";

function maskApiKey(apiKey: string): string {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "*".repeat(apiKey.length);
  return `${apiKey.slice(0, 4)}${"*".repeat(Math.max(4, apiKey.length - 8))}${apiKey.slice(-4)}`;
}

export default function SettingsPage() {
  const { t } = useTranslations();
  const hs = t.hub.settings;

  const [draft, setDraft] = useState<RuntimeConfig>(() => getRuntimeConfig());
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSaved(false), 1400);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const onSave = () => {
    const next = saveRuntimeConfig(draft);
    setDraft(next);
    setSaved(true);
  };

  const onTestConnection = async () => {
    setTesting(true);
    setTestMessage(null);
    setTestOk(null);
    try {
      const res = await apiPost<{ ok: boolean; message: string }>("/model/connection-test", {
        model_base_url: draft.modelBaseUrl.trim(),
        model_api_key: draft.modelApiKey.trim(),
      });
      setTestOk(res.ok);
      setTestMessage(res.ok ? hs.testSuccess : `${hs.testFailedPrefix}${res.message}`);
    } catch (error) {
      setTestOk(false);
      setTestMessage(`${hs.testFailedPrefix}${(error as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  const onReset = () => {
    const next = saveRuntimeConfig({
      modelBaseUrl: "",
      modelApiKey: "",
      modelName: "gpt-4o-mini",
    });
    setDraft(next);
    setSaved(false);
  };

  return (
    <SiteChrome>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">{hs.title}</h1>
          <p className="mt-1 text-sm text-zinc-500">{hs.subtitle}</p>
        </div>

        <section className="overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-panel)]">
          <div className="border-b border-[var(--border-hairline)] bg-black/25 px-4 py-3">
            <div className="flex items-center gap-2 text-zinc-200">
              <Server className="h-4 w-4 text-zinc-400" aria-hidden />
              <h2 className="text-sm font-medium">{hs.endpointCardTitle}</h2>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{hs.endpointCardDesc}</p>
          </div>

          <div className="space-y-5 p-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{hs.baseUrlLabel}</span>
              <input
                type="url"
                value={draft.modelBaseUrl}
                onChange={(e) => setDraft((prev) => ({ ...prev, modelBaseUrl: e.target.value }))}
                placeholder={hs.baseUrlPlaceholder}
                className="h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-black/30 px-3 text-sm text-zinc-100 outline-none transition focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--ring)]"
              />
              <p className="text-[11px] text-zinc-600">{hs.testPathHint}</p>
            </label>

            <label className="block space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <KeyRound className="h-3.5 w-3.5" aria-hidden />
                {hs.apiKeyLabel}
              </span>
              <input
                type="password"
                value={draft.modelApiKey}
                onChange={(e) => setDraft((prev) => ({ ...prev, modelApiKey: e.target.value }))}
                placeholder={hs.apiKeyPlaceholder}
                className="h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-black/30 px-3 text-sm text-zinc-100 outline-none transition focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--ring)]"
              />
              {maskApiKey(draft.modelApiKey) ? (
                <p className="text-[11px] text-zinc-500">
                  {hs.apiKeyLabel}:{" "}
                  <span className="font-mono text-zinc-300">{maskApiKey(draft.modelApiKey)}</span> ({hs.maskedConfigured})
                </p>
              ) : null}
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{hs.modelNameLabel}</span>
              <input
                type="text"
                value={draft.modelName}
                onChange={(e) => setDraft((prev) => ({ ...prev, modelName: e.target.value }))}
                placeholder={hs.modelNamePlaceholder}
                className="h-11 w-full rounded-xl border border-[var(--border-subtle)] bg-black/30 px-3 text-sm text-zinc-100 outline-none transition focus:border-[var(--border-strong)] focus:ring-1 focus:ring-[var(--ring)]"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onSave}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-[12px] font-medium text-zinc-900 transition hover:bg-white"
              >
                {saved ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                {saved ? hs.saved : hs.save}
              </button>
              <button
                type="button"
                onClick={() => void onTestConnection()}
                disabled={testing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-medium text-emerald-200 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                {testing ? hs.testingConnection : hs.testConnection}
              </button>
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-zinc-300 transition hover:bg-white/[0.08]"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                {hs.reset}
              </button>
            </div>
            {testMessage ? (
              <div
                className={`rounded-lg border px-3 py-2 text-[12px] ${
                  testOk ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"
                }`}
              >
                {testMessage}
              </div>
            ) : null}
          </div>
        </section>

        <div className="rounded-xl border border-[var(--border-hairline)] bg-black/20 px-3 py-2.5 text-xs text-zinc-500">
          {hs.securityHint}
        </div>
        <p className="text-xs text-zinc-600">{hs.runtimeHint}</p>
      </div>
    </SiteChrome>
  );
}
