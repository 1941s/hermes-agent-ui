"use client";

import Link from "next/link";
import { useState } from "react";

import { SiteChrome } from "@/components/site-chrome";
import { useTranslations } from "@/hooks/use-translations";
import { apiPost } from "@/lib/agent-api";

export default function SkillEditorPage() {
  const { t } = useTranslations();
  const he = t.hub.editor;
  const [code, setCode] = useState('print("hello")');
  const [out, setOut] = useState<string | null>(null);

  const run = async () => {
    setOut(null);
    try {
      const res = await apiPost<{
        ok: boolean;
        mode: string;
        stdout: string;
        stderr: string;
        warning?: string;
      }>("/skills/hermes-ui/demo-skill/sandbox-run", { code });
      setOut(JSON.stringify(res, null, 2));
    } catch (e) {
      setOut((e as Error).message);
    }
  };

  return (
    <SiteChrome>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">{he.title}</h1>
            <p className="mt-1 text-sm text-zinc-500">{he.subtitle}</p>
          </div>
          <Link href="/skills" className="text-[12px] text-zinc-400 hover:text-zinc-200">
            {he.backToHub}
          </Link>
        </div>

        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="hermes-panel min-h-[240px] w-full resize-y rounded-lg p-3 font-mono text-[12px] text-zinc-100"
        />
        <button
          type="button"
          onClick={() => void run()}
          className="rounded-lg bg-zinc-100 px-3 py-1.5 text-[12px] font-medium text-zinc-900 hover:bg-white"
        >
          {he.runSandbox}
        </button>
        {out ? (
          <pre className="hermes-panel overflow-x-auto rounded-lg p-3 font-mono text-[11px] text-zinc-300">{out}</pre>
        ) : null}
      </div>
    </SiteChrome>
  );
}
