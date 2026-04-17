"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { SiteChrome } from "@/components/site-chrome";
import { useTranslations } from "@/hooks/use-translations";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/agent-api";

type CatalogItem = {
  package_name: string;
  version: string;
  name?: string;
  description?: string;
  tags?: string[];
  installed?: boolean;
  manifest: Record<string, unknown>;
};
type InstallRow = {
  package_name: string;
  version: string;
  enabled: number;
  installed_at: string;
  name?: string;
  sync_status?: string;
  sync_error?: string | null;
  synced_at?: string | null;
};
type HubSearchItem = {
  name: string;
  description?: string;
  identifier: string;
  source: string;
  trust: string;
  tags?: string[];
  url?: string;
};
type HubSearchResponse = {
  items: HubSearchItem[];
  total?: number;
  offset?: number;
  limit?: number;
  has_more?: boolean;
};

export default function SkillsPage() {
  const { t, locale, setLocale } = useTranslations();
  const hs = t.hub.skills;
  const qc = useQueryClient();
  const [raw, setRaw] = useState("");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [installingPkg, setInstallingPkg] = useState<string | null>(null);
  const [hubQuery, setHubQuery] = useState("");
  const [hubInstallingIdentifier, setHubInstallingIdentifier] = useState<string | null>(null);
  const [hubSearching, setHubSearching] = useState(false);
  const [hubResults, setHubResults] = useState<HubSearchItem[]>([]);
  const [hubHasSearched, setHubHasSearched] = useState(false);
  const [hubTotal, setHubTotal] = useState(0);
  const [hubHasMore, setHubHasMore] = useState(false);
  const [hubPage, setHubPage] = useState(1);
  const [hubPageSize, setHubPageSize] = useState(20);
  const [deletingCatalogPkg, setDeletingCatalogPkg] = useState<string | null>(null);
  const [uninstallingPkg, setUninstallingPkg] = useState<string | null>(null);
  const [togglingPkg, setTogglingPkg] = useState<string | null>(null);

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

  const filteredCatalog = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const rows = catalogQ.data?.items ?? [];
    if (!keyword) return rows;
    return rows.filter((it) => {
      const tags = (it.tags ?? []).join(" ").toLowerCase();
      const description = String(it.description ?? "").toLowerCase();
      const name = String(it.name ?? it.package_name).toLowerCase();
      return name.includes(keyword) || description.includes(keyword) || tags.includes(keyword);
    });
  }, [catalogQ.data?.items, search]);

  const installFromManifest = async (manifest: Record<string, unknown>) => {
    setMsg(null);
    try {
      await apiPost("/skills/install", { payload: { manifest } });
      setMsg({ type: "ok", text: hs.installedOk });
      await qc.invalidateQueries({ queryKey: ["skills"] });
    } catch (e) {
      setMsg({ type: "error", text: (e as Error).message });
      throw e;
    }
  };

  const installFromCard = async (it: CatalogItem) => {
    setInstallingPkg(it.package_name);
    try {
      await installFromManifest(it.manifest);
    } finally {
      setInstallingPkg(null);
    }
  };

  const installFromJson = async () => {
    setMsg(null);
    try {
      const manifest = JSON.parse(raw) as Record<string, unknown>;
      await installFromManifest(manifest);
      setRaw("");
    } catch (e) {
      setMsg({ type: "error", text: (e as Error).message });
    }
  };

  const installFromHub = async (identifier: string) => {
    setMsg(null);
    const ident = identifier.trim();
    if (!ident) {
      setMsg({ type: "error", text: hs.installFromHubEmptyError });
      return;
    }
    setHubInstallingIdentifier(ident);
    try {
      const res = await apiPost<{ imported: number; identifier: string }>("/skills/install-from-hub", {
        payload: { identifier: ident },
      });
      setMsg({
        type: "ok",
        text: `${hs.installFromHubOkPrefix} ${res.identifier}. ${hs.installFromHubOkImportedPrefix} ${res.imported} ${hs.installFromHubOkImportedSuffix}`,
      });
      await qc.invalidateQueries({ queryKey: ["skills"] });
    } catch (e) {
      setMsg({ type: "error", text: (e as Error).message });
    } finally {
      setHubInstallingIdentifier(null);
    }
  };

  const searchHub = async (nextPage = 1) => {
    setMsg(null);
    const q = hubQuery.trim();
    if (q.length < 2) {
      setMsg({ type: "error", text: hs.installFromHubEmptyError });
      return;
    }
    const safePage = Math.max(1, nextPage);
    const offset = (safePage - 1) * hubPageSize;
    setHubHasSearched(true);
    setHubSearching(true);
    try {
      const res = await apiGet<HubSearchResponse>(
        `/skills/hub/search?q=${encodeURIComponent(q)}&limit=${hubPageSize}&offset=${offset}`,
      );
      setHubResults(res.items ?? []);
      setHubTotal(Math.max(0, Number(res.total ?? (res.items ?? []).length)));
      setHubHasMore(Boolean(res.has_more));
      setHubPage(safePage);
      if (!res.items || res.items.length === 0) {
        setMsg({ type: "error", text: hs.searchHubNoResult });
      }
    } catch (e) {
      setMsg({ type: "error", text: (e as Error).message });
      setHubResults([]);
      setHubTotal(0);
      setHubHasMore(false);
    } finally {
      setHubSearching(false);
    }
  };

  const openHubDetail = (item: HubSearchItem) => {
    const url = String(item.url ?? "").trim();
    if (!url) {
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const deleteCatalogItem = async (pkg: string) => {
    setDeletingCatalogPkg(pkg);
    setMsg(null);
    try {
      await apiDelete(`/skills/catalog/${encodeURIComponent(pkg)}`);
      setMsg({ type: "ok", text: `${hs.deleteCatalogDonePrefix} ${pkg}` });
      await qc.invalidateQueries({ queryKey: ["skills"] });
    } catch (e) {
      setMsg({ type: "error", text: (e as Error).message });
    } finally {
      setDeletingCatalogPkg(null);
    }
  };

  const uninstall = async (pkg: string) => {
    setUninstallingPkg(pkg);
    setMsg(null);
    try {
      await apiDelete(`/skills/installed/${encodeURIComponent(pkg)}`);
      setMsg({ type: "ok", text: hs.uninstalledOk });
      await qc.invalidateQueries({ queryKey: ["skills"] });
    } catch (e) {
      setMsg({ type: "error", text: (e as Error).message });
    } finally {
      setUninstallingPkg(null);
    }
  };

  const toggleEnabled = async (pkg: string, enabled: boolean) => {
    setTogglingPkg(pkg);
    setMsg(null);
    try {
      await apiPatch(`/skills/installed/${encodeURIComponent(pkg)}/enabled`, {
        payload: { enabled },
      });
      setMsg({ type: "ok", text: enabled ? hs.skillEnabledSynced : hs.skillDisabledRuntime });
      await qc.invalidateQueries({ queryKey: ["skills"] });
    } catch (e) {
      setMsg({ type: "error", text: (e as Error).message });
    } finally {
      setTogglingPkg(null);
    }
  };

  return (
    <SiteChrome>
      <div className="space-y-6">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-gradient-to-br from-white/[0.04] via-white/[0.01] to-transparent p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-100">{hs.title}</h1>
              <p className="mt-1 text-sm text-zinc-500">{hs.subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-0.5 rounded-lg border border-[var(--border-hairline)] bg-black/20 p-0.5"
                role="group"
                aria-label={hs.languageToggleAria}
              >
                <button
                  type="button"
                  onClick={() => setLocale("zh")}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    locale === "zh" ? "bg-white/[0.08] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {hs.langZh}
                </button>
                <button
                  type="button"
                  onClick={() => setLocale("en")}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    locale === "en" ? "bg-white/[0.08] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {hs.langEn}
                </button>
              </div>
              <Link
                href="/skills/editor"
                className="rounded-lg border border-[var(--border-hairline)] bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-zinc-100 transition hover:bg-white/[0.1]"
              >
                {hs.editorLink}
              </Link>
            </div>
          </div>
        </div>

        {msg ? (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              msg.type === "ok"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/25 bg-rose-500/10 text-rose-200"
            }`}
          >
            {msg.text}
          </div>
        ) : null}

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <section className="self-start rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-4">
            <div className="sticky top-2 z-10 -mx-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-panel)]/95 p-2 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={hubQuery}
                  onChange={(e) => {
                    setHubQuery(e.target.value);
                    setHubHasSearched(false);
                  }}
                  placeholder={hs.searchHubPlaceholder}
                  className="hermes-input min-w-[320px] flex-1 rounded-lg border border-[var(--border-hairline)] bg-black/20 px-3 py-2 text-[12px] text-zinc-100 placeholder:text-zinc-600"
                />
                <button
                  type="button"
                  onClick={() => void searchHub(1)}
                  disabled={hubSearching}
                  className="rounded-lg bg-zinc-100 px-3 py-1.5 text-[12px] font-medium text-zinc-900 transition enabled:hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {hubSearching ? hs.loadingShort : hs.searchHubButton}
                </button>
              </div>
              {hubHasSearched && !hubSearching ? (
                <div className="mt-1 text-[11px] text-zinc-500">
                  {hs.searchHubResultsTitle} · {hs.paginationTotalPrefix}{" "}
                  {hubHasMore ? `${locale === "zh" ? "至少 " : ">= "}${hubTotal}` : hubTotal} {hs.itemsCountSuffix}
                </div>
              ) : null}
            </div>

            <div className="mt-3 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {hubSearching ? (
                <div className="space-y-3">
                  <div className="text-[12px] text-zinc-400">{locale === "zh" ? "搜索中..." : "Searching..."}</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div
                        key={`hub-skeleton-${idx}`}
                        className="animate-pulse rounded-xl border border-[var(--border-hairline)] bg-black/20 p-3"
                      >
                        <div className="h-4 w-2/3 rounded bg-zinc-700/50" />
                        <div className="mt-2 h-3 w-1/3 rounded bg-zinc-700/40" />
                        <div className="mt-3 h-3 w-full rounded bg-zinc-700/30" />
                        <div className="mt-2 h-3 w-5/6 rounded bg-zinc-700/30" />
                        <div className="mt-3 h-7 w-20 rounded bg-zinc-700/40" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : hubResults.length > 0 ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    {hubResults.map((item, idx) => (
                      <div
                        key={`${item.name}-${idx}`}
                        className="rounded-xl border border-[var(--border-hairline)] bg-black/20 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
                      >
                        <div className="break-all text-[13px] font-semibold text-zinc-100">{item.name}</div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          {item.source} · {item.trust || "-"}
                        </div>
                        {item.description ? (
                          <div className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-zinc-400">{item.description}</div>
                        ) : null}
                        {item.tags && item.tags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {item.tags.slice(0, 6).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-md border border-[var(--border-hairline)] bg-black/30 px-1.5 py-0.5 text-[10px] text-zinc-400"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-2 break-all rounded border border-[var(--border-hairline)] bg-black/30 px-2 py-1 font-mono text-[11px] text-zinc-300">
                          {item.identifier || "-"}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!item.identifier || Boolean(hubInstallingIdentifier)}
                            onClick={() => void installFromHub(item.identifier)}
                            className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-900 enabled:hover:bg-white disabled:opacity-40"
                          >
                            {hubInstallingIdentifier === item.identifier ? hs.installing : hs.install}
                          </button>
                          <button
                            type="button"
                            disabled={!item.url}
                            onClick={() => openHubDetail(item)}
                            className="rounded-lg border border-[var(--border-hairline)] bg-white/[0.06] px-2.5 py-1 text-[11px] text-zinc-200 enabled:hover:bg-white/[0.1] disabled:opacity-40"
                          >
                            {hs.inspectThisSkill}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-black/20 p-2 text-[11px] text-zinc-400">
                    <button
                      type="button"
                      disabled={hubSearching || hubPage <= 1}
                      onClick={() => void searchHub(hubPage - 1)}
                      className="rounded border border-[var(--border-hairline)] px-2 py-1 enabled:hover:bg-white/[0.06] disabled:opacity-40"
                    >
                      {hs.paginationPrev}
                    </button>
                  <span className="rounded border border-[var(--border-hairline)] bg-black/30 px-2 py-1 text-zinc-300">
                    {hs.paginationPagePrefix} {hubPage}
                  </span>
                    <button
                      type="button"
                    disabled={hubSearching || !hubHasMore}
                      onClick={() => void searchHub(hubPage + 1)}
                      className="rounded border border-[var(--border-hairline)] px-2 py-1 enabled:hover:bg-white/[0.06] disabled:opacity-40"
                    >
                      {hs.paginationNext}
                    </button>
                    <span className="ml-1 text-zinc-500">{hubHasMore ? (locale === "zh" ? "还有下一页" : "More pages available") : (locale === "zh" ? "最后一页" : "Last page")}</span>
                    <span className="ml-auto text-zinc-500">{locale === "zh" ? "每页条数" : "Page Size"}</span>
                    <select
                      value={hubPageSize}
                      onChange={(e) => {
                        const next = Number(e.target.value) || 20;
                        setHubPageSize(next);
                        void searchHub(1);
                      }}
                      className="rounded border border-[var(--border-hairline)] bg-black/30 px-2 py-1 text-[11px] text-zinc-200"
                    >
                      <option value={20}>20 / {hs.pageSizeUnit}</option>
                      <option value={30}>30 / {hs.pageSizeUnit}</option>
                      <option value={50}>50 / {hs.pageSizeUnit}</option>
                    </select>
                  </div>
                </>
              ) : hubHasSearched && hubQuery.trim().length >= 2 && !hubSearching ? (
                <div className="rounded-lg border border-dashed border-[var(--border-hairline)] bg-black/20 p-6 text-center text-sm text-zinc-500">
                  {hs.searchHubNoResult}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--border-hairline)] bg-black/20 p-6 text-center text-sm text-zinc-500">
                  {hs.searchHubPlaceholder}
                </div>
              )}
            </div>
          </section>

          <div className="space-y-4">
            <section className="space-y-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-panel)] p-4">
              <h2 className="text-[13px] font-medium uppercase tracking-wider text-zinc-500">{hs.sectionInstalled}</h2>
              <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-black/20">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead className="border-b border-[var(--border-hairline)] bg-black/25 text-[10px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">{hs.tablePackage}</th>
                      <th className="px-3 py-2 font-medium">{hs.tableVersion}</th>
                      <th className="px-3 py-2 font-medium">{hs.tableEnabled}</th>
                      <th className="px-3 py-2 font-medium">{hs.tableRuntimeSync}</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {(installedQ.data?.items ?? []).map((row) => (
                      <tr key={row.package_name} className="border-b border-[var(--border-hairline)]/60">
                        <td className="px-3 py-2 font-mono text-zinc-200">{row.package_name}</td>
                        <td className="px-3 py-2 text-zinc-300">{row.version}</td>
                        <td className="px-3 py-2 text-zinc-300">
                          <button
                            type="button"
                            disabled={togglingPkg === row.package_name}
                            onClick={() => void toggleEnabled(row.package_name, row.enabled === 0)}
                            className={`rounded border px-2 py-0.5 text-[11px] ${
                              row.enabled === 1
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                : "border-zinc-700 bg-zinc-800 text-zinc-400"
                            } disabled:opacity-50`}
                          >
                            {togglingPkg === row.package_name ? "..." : row.enabled === 1 ? "ON" : "OFF"}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-[11px] text-zinc-400">
                          <div>{row.sync_status ?? hs.runtimePending}</div>
                          {row.sync_error ? <div className="mt-0.5 text-rose-300">{row.sync_error}</div> : null}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={uninstallingPkg === row.package_name}
                            className="text-[11px] text-rose-300 hover:text-rose-200"
                            onClick={() => void uninstall(row.package_name)}
                          >
                            {uninstallingPkg === row.package_name ? hs.removing : hs.remove}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <details className="group rounded-lg border border-[var(--border-hairline)] bg-black/20">
                <summary className="cursor-pointer list-none px-3 py-2 text-[13px] font-medium text-zinc-300">
                  {hs.sectionCatalog}
                </summary>
                <div className="space-y-3 p-3 pt-0">
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-black/20 p-2">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={hs.searchPlaceholder}
                      className="hermes-input min-w-[260px] rounded-lg border border-[var(--border-hairline)] bg-black/20 px-3 py-2 text-[12px] text-zinc-100 placeholder:text-zinc-600"
                    />
                    <span className="text-[11px] text-zinc-500">
                      {filteredCatalog.length} {hs.itemsCountSuffix}
                    </span>
                  </div>
                  {catalogQ.isLoading ? <div className="text-sm text-zinc-500">{t.hub.insights.loading}</div> : null}
                  <div className="grid gap-3">
                    {filteredCatalog.map((it) => (
                      <div
                        key={`${it.package_name}@${it.version}`}
                        className="hermes-panel rounded-xl border border-[var(--border-hairline)] bg-black/20 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-mono text-[13px] text-zinc-100">
                            {it.package_name}@{it.version}
                          </div>
                          {it.installed ? (
                            <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                              {hs.installedBadge}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-[12px] text-zinc-500">{String(it.description ?? "")}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(it.tags ?? []).map((tag) => (
                            <span
                              key={tag}
                              className="rounded border border-[var(--border-hairline)] bg-black/20 px-1.5 py-0.5 text-[10px] text-zinc-400"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={Boolean(it.installed) || installingPkg === it.package_name}
                            onClick={() => void installFromCard(it)}
                            className="rounded-lg bg-zinc-100 px-3 py-1.5 text-[12px] font-medium text-zinc-900 transition enabled:hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {installingPkg === it.package_name ? hs.installing : it.installed ? hs.installedState : hs.install}
                          </button>
                          <button
                            type="button"
                            disabled={deletingCatalogPkg === it.package_name}
                            onClick={() => void deleteCatalogItem(it.package_name)}
                            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[12px] font-medium text-rose-300 transition enabled:hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {deletingCatalogPkg === it.package_name ? hs.deleting : hs.delete}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            </section>

            <section className="space-y-3">
              <details className="group rounded-lg border border-[var(--border-hairline)] bg-black/20">
                <summary className="cursor-pointer list-none px-3 py-2 text-[13px] font-medium text-zinc-300">
                  {hs.sectionDepGraph}
                </summary>
                <div className="hermes-panel m-3 mt-0 rounded-lg p-3 text-[12px] text-zinc-300">
                  <div className="mb-2 text-[11px] text-zinc-500">{hs.depGraphHint}</div>
                  <ul className="space-y-1 font-mono text-[11px]">
                    {(depQ.data?.edges ?? []).map((e, i) => (
                      <li key={i}>
                        {e.source} → {e.target} <span className="text-zinc-500">({e.label})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </section>

            <section className="space-y-3">
              <details className="group rounded-lg border border-[var(--border-hairline)] bg-black/20">
                <summary className="cursor-pointer list-none px-3 py-2 text-[13px] font-medium text-zinc-300">
                  {hs.sectionInstallJson} (Advanced)
                </summary>
                <div className="space-y-3 p-3 pt-0">
                  <textarea
                    value={raw}
                    onChange={(e) => setRaw(e.target.value)}
                    placeholder={hs.placeholderJson}
                    className="hermes-panel min-h-[180px] w-full resize-y rounded-lg p-3 font-mono text-[12px] text-zinc-100 placeholder:text-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={() => void installFromJson()}
                    className="rounded-lg bg-zinc-100 px-3 py-1.5 text-[12px] font-medium text-zinc-900 hover:bg-white"
                  >
                    {hs.install}
                  </button>
                </div>
              </details>
            </section>
          </div>
        </div>

      </div>
    </SiteChrome>
  );
}
