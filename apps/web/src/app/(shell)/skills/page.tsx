"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { SiteChrome } from "@/components/site-chrome";
import { useTranslations } from "@/hooks/use-translations";
import { apiDelete, apiGet, apiPost } from "@/lib/agent-api";

type CatalogItem = { package_name: string; version: string; manifest: Record<string, unknown> };
type InstallRow = { package_name: string; version: string; enabled: number; installed_at: string };

export default function SkillsPage() {
  const { t } = useTranslations();
  const hs = t.hub.skills;
  const qc = useQueryClient();
  const [raw, setRaw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const catalogQ = useQuery({
    queryKey: ["skills", "catalog"],
    queryFn: () => apiGet<{ items: CatalogItem[] }>("/skills/catalog"),
  });
  const installedQ = useQuery({
    queryKey: ["skills", "installed"],
    queryFn: () => apiGet<{ items: InstallRow[] }>("/skills/installed"),
  });
  const depQ = useQuery({
    queryKey: ["skills", "deps", "hermes-ui/demo-skill"],
    queryFn: () =>
      apiGet<{
        nodes: { id: string; label: string }[];
        edges: { source: string; target: string; label: string }[];
      }>(`/skills/dependency-graph?packages=${encodeURIComponent("hermes-ui/demo-skill")}`),
  });

  const install = async () => {
    setMsg(null);
    try {
      const manifest = JSON.parse(raw) as Record<string, unknown>;
      await apiPost("/skills/install", { manifest });
      setMsg(hs.installedOk);
      setRaw("");
      await qc.invalidateQueries({ queryKey: ["skills"] });
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const uninstall = async (pkg: string) => {
    setMsg(null);
    try {
      await apiDelete(`/skills/installed/${encodeURIComponent(pkg)}`);
      setMsg(hs.uninstalledOk);
      await qc.invalidateQueries({ queryKey: ["skills"] });
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <SiteChrome>
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">{hs.title}</h1>
            <p className="mt-1 text-sm text-zinc-500">{hs.subtitle}</p>
          </div>
          <Link
            href="/skills/editor"
            className="rounded-lg border border-[var(--border-hairline)] bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-zinc-100 hover:bg-white/[0.1]"
          >
            {hs.editorLink}
          </Link>
        </div>

        {msg ? <div className="text-sm text-zinc-400">{msg}</div> : null}

        <section className="space-y-3">
          <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{hs.sectionCatalog}</h2>
          {catalogQ.isLoading ? <div className="text-sm text-zinc-500">{t.hub.insights.loading}</div> : null}
          <div className="grid gap-3 md:grid-cols-2">
            {(catalogQ.data?.items ?? []).map((it) => (
              <div key={`${it.package_name}@${it.version}`} className="hermes-panel rounded-lg p-3">
                <div className="font-mono text-[13px] text-zinc-100">
                  {it.package_name}@{it.version}
                </div>
                <div className="mt-1 text-[12px] text-zinc-500">
                  {String((it.manifest as { package?: { description?: string } }).package?.description ?? "")}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{hs.sectionInstalled}</h2>
          <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)]">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="border-b border-[var(--border-hairline)] bg-black/25 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">{hs.tablePackage}</th>
                  <th className="px-3 py-2 font-medium">{hs.tableVersion}</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(installedQ.data?.items ?? []).map((row) => (
                  <tr key={row.package_name} className="border-b border-[var(--border-hairline)]/60">
                    <td className="px-3 py-2 font-mono text-zinc-200">{row.package_name}</td>
                    <td className="px-3 py-2 text-zinc-300">{row.version}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="text-[11px] text-rose-300 hover:text-rose-200"
                        onClick={() => void uninstall(row.package_name)}
                      >
                        {hs.remove}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{hs.sectionInstallJson}</h2>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={hs.placeholderJson}
            className="hermes-panel min-h-[180px] w-full resize-y rounded-lg p-3 font-mono text-[12px] text-zinc-100 placeholder:text-zinc-600"
          />
          <button
            type="button"
            onClick={() => void install()}
            className="rounded-lg bg-zinc-100 px-3 py-1.5 text-[12px] font-medium text-zinc-900 hover:bg-white"
          >
            {hs.install}
          </button>
        </section>

        <section className="space-y-3">
          <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{hs.sectionDepGraph}</h2>
          <div className="hermes-panel rounded-lg p-3 text-[12px] text-zinc-300">
            <div className="mb-2 text-[11px] text-zinc-500">{hs.depGraphHint}</div>
            <ul className="space-y-1 font-mono text-[11px]">
              {(depQ.data?.edges ?? []).map((e, i) => (
                <li key={i}>
                  {e.source} → {e.target} <span className="text-zinc-500">({e.label})</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </SiteChrome>
  );
}
