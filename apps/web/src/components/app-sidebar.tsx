"use client";

import {
  BarChart3,
  GitBranch,
  MessageSquare,
  Package,
  PanelLeftClose,
  PanelLeft,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTranslations } from "@/hooks/use-translations";
import { useUiStore } from "@/stores/ui-store";

type NavItem = {
  href: string;
  label: string;
  icon: typeof MessageSquare;
  match: (path: string) => boolean;
  /** Show “开发中 / In development” badge (hub areas not finalized). */
  inDevelopment?: boolean;
};

export function AppSidebar() {
  const pathname = usePathname();
  const { t, locale, setLocale } = useTranslations();
  const h = t.hub;
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const sb = h.sidebar;

  const items: NavItem[] = [
    {
      href: "/",
      label: h.nav.chat,
      icon: MessageSquare,
      match: (p) => p === "/",
    },
    {
      href: "/insights",
      label: h.nav.insights,
      icon: BarChart3,
      match: (p) => p === "/insights" || p.startsWith("/insights/"),
      inDevelopment: true,
    },
    {
      href: "/skills",
      label: h.nav.skills,
      icon: Package,
      match: (p) => p === "/skills" || p.startsWith("/skills/"),
      inDevelopment: true,
    },
    {
      href: "/orchestration",
      label: h.nav.orchestration,
      icon: GitBranch,
      match: (p) => p === "/orchestration" || p.startsWith("/orchestration/"),
      inDevelopment: true,
    },
    {
      href: "/settings",
      label: h.nav.settings,
      icon: Settings,
      match: (p) => p === "/settings" || p.startsWith("/settings/"),
    },
  ];

  return (
    <aside
      className={`hermes-sidebar flex shrink-0 flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-sidebar)] transition-[width] duration-200 ease-out ${
        sidebarCollapsed ? "w-[56px]" : "w-[220px] md:w-[240px]"
      }`}
      aria-label={h.navAria}
    >
      {/* Product mark — ChatGPT / Cursor–style top zone */}
      <div className="flex h-12 shrink-0 items-center border-b border-[var(--border-hairline)] px-2">
        <Link
          href="/"
          className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04] ${
            sidebarCollapsed ? "justify-center" : ""
          }`}
          aria-label={sb.productAria}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-black/25 text-zinc-400">
            <Sparkles className="h-4 w-4" aria-hidden />
          </div>
          {!sidebarCollapsed ? (
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold tracking-tight text-zinc-100">{t.appName}</div>
              <div className="truncate text-[10px] text-zinc-600">{h.brand}</div>
            </div>
          ) : null}
        </Link>
      </div>

      {/* Primary navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {items.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          const devTitle = item.inDevelopment ? `${item.label} — ${sb.navDevBadge}` : item.label;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={sidebarCollapsed ? devTitle : undefined}
              className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-white/[0.08] text-zinc-100 shadow-[inset_2px_0_0_0_rgba(255,255,255,0.12)]"
                  : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
              } ${sidebarCollapsed ? "justify-center" : ""}`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0 opacity-90" aria-hidden />
              {!sidebarCollapsed ? (
                <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="truncate">{item.label}</span>
                  {item.inDevelopment ? (
                    <span
                      className="shrink-0 rounded border border-amber-500/25 bg-amber-500/[0.08] px-1.5 py-px text-[10px] font-medium leading-tight text-amber-400/95"
                      aria-hidden
                    >
                      {sb.navDevBadge}
                    </span>
                  ) : null}
                </span>
              ) : item.inDevelopment ? (
                <span className="sr-only">{sb.navDevBadge}</span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Footer: language + collapse — VS Code–adjacent utilities */}
      <div className="shrink-0 border-t border-[var(--border-hairline)] p-2">
        {!sidebarCollapsed ? (
          <div
            className="mb-2 flex items-center gap-0.5 rounded-lg border border-[var(--border-hairline)] bg-black/20 p-0.5"
            role="group"
            aria-label={t.labels.language}
          >
            <button
              type="button"
              onClick={() => setLocale("zh")}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                locale === "zh" ? "bg-white/[0.08] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              中文
            </button>
            <button
              type="button"
              onClick={() => setLocale("en")}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                locale === "en" ? "bg-white/[0.08] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              EN
            </button>
          </div>
        ) : (
          <div className="mb-2 flex justify-center" aria-label={t.labels.language}>
            <span className="rounded-md border border-[var(--border-hairline)] bg-black/20 px-2 py-1 text-[10px] font-medium text-zinc-500">
              {locale === "zh" ? "中" : "EN"}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => toggleSidebarCollapsed()}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300 ${
            sidebarCollapsed ? "justify-center" : ""
          }`}
          aria-expanded={!sidebarCollapsed}
          aria-label={sidebarCollapsed ? sb.expand : sb.collapse}
          title={sidebarCollapsed ? sb.expand : sb.collapse}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{sb.collapse}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
