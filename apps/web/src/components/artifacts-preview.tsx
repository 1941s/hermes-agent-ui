"use client";

import type { Messages } from "@hermes-ui/config/locale-messages";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { useTranslations } from "@/hooks/use-translations";
import type { AgentFrame } from "@/hooks/use-agent";

const MarkdownPreview = dynamic(
  () => import("@/components/markdown-preview").then((mod) => mod.MarkdownPreview),
  { ssr: false },
);

type Props = {
  frames: AgentFrame[];
  responseText: string;
};

type ArtifactPayload = {
  artifact_id?: string;
  source_tool?: string;
  artifact_type?: "markdown" | "json" | "html" | "text" | "image_url";
  mime?: string;
  content?: string;
  truncated?: boolean;
  original_length?: number;
  security_policy?: {
    sandbox?: "zero-privilege" | string;
    allow?: string[];
  };
  blocked?: boolean;
  block_reason?: string;
};

function renderArtifact(payload: ArtifactPayload, labels: Messages["labels"]) {
  const artifactType = payload.artifact_type ?? "text";
  const content = payload.content ?? "";

  if (artifactType === "markdown") {
    return <MarkdownPreview content={content} />;
  }

  if (artifactType === "json") {
    let pretty = content;
    try {
      pretty = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      pretty = content;
    }
    return (
      <pre className="overflow-x-auto rounded-lg border border-white/[0.08] bg-zinc-950/80 p-3 text-xs text-zinc-200">
        {pretty}
      </pre>
    );
  }

  if (artifactType === "html") {
    const policy = payload.security_policy;
    const isZeroPrivilege = policy?.sandbox === "zero-privilege" && (policy.allow?.length ?? 0) === 0;
    if (!isZeroPrivilege || payload.blocked) {
      return (
        <div className="space-y-2">
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
            {labels.policyBlocked}
            {payload.block_reason ? ` ${labels.blockReason}: ${payload.block_reason}` : ""}
          </div>
          <pre className="overflow-x-auto rounded-lg border border-white/[0.08] bg-zinc-950/80 p-3 text-xs text-zinc-200">
            {content}
          </pre>
        </div>
      );
    }
    return (
      <iframe
        className="h-56 w-full rounded-lg border border-white/[0.08] bg-white"
        sandbox=""
        srcDoc={content}
        title={payload.artifact_id ?? "artifact-html"}
      />
    );
  }

  if (artifactType === "image_url") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt="artifact" className="max-h-64 rounded-lg border border-white/[0.08] object-contain" src={content} />
    );
  }

  return (
    <pre className="overflow-x-auto rounded-lg border border-white/[0.08] bg-zinc-950/80 p-3 text-xs text-zinc-200">
      {content}
    </pre>
  );
}

export function ArtifactsPreview({ frames, responseText }: Props) {
  const { t } = useTranslations();
  const [mode, setMode] = useState<"preview" | "tools" | "artifacts">("preview");

  const toolLogs = useMemo(
    () =>
      frames
        .filter((f) => f.type === "TOOL_CALL")
        .map((f) => ({
          key: `${f.trace_id}-${f.seq}`,
          payload: f.payload,
        })),
    [frames],
  );

  const artifacts = useMemo(
    () =>
      frames
        .filter((f) => f.type === "ARTIFACT")
        .map((f) => ({
          key: `${f.trace_id}-${f.seq}`,
          payload: f.payload as ArtifactPayload,
        })),
    [frames],
  );

  const tabBtn = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition ${
      active
        ? "bg-white/[0.08] text-zinc-100 ring-1 ring-[var(--border-strong)]"
        : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"
    }`;

  return (
    <div className="flex min-h-0 grow flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-black/25">
      <div className="flex gap-1 border-b border-white/[0.06] p-2">
        <button className={tabBtn(mode === "preview")} onClick={() => setMode("preview")} type="button">
          {t.labels.preview}
        </button>
        <button className={tabBtn(mode === "artifacts")} onClick={() => setMode("artifacts")} type="button">
          {t.labels.artifacts}
        </button>
        <button className={tabBtn(mode === "tools")} onClick={() => setMode("tools")} type="button">
          {t.labels.toolLogs}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 text-sm">
        {mode === "preview" ? (
          <MarkdownPreview content={responseText} />
        ) : mode === "artifacts" ? (
          <div className="space-y-3">
            {artifacts.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500">{t.labels.noToolLogs}</div>
            ) : (
              artifacts.map((item) => (
                <div key={item.key} className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                  <div className="text-xs text-zinc-500">
                    {(item.payload.source_tool ?? "tool").toString()} · {item.payload.artifact_type ?? "text"}
                  </div>
                  {item.payload.truncated ? (
                    <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-2 text-xs text-amber-200">
                      {t.labels.truncatedByServer} {t.labels.originalLength}: {item.payload.original_length ?? "—"}
                    </div>
                  ) : null}
                  {renderArtifact(item.payload, t.labels)}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {toolLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500">{t.labels.noToolLogs}</div>
            ) : (
              toolLogs.map((log) => (
                <pre
                  key={log.key}
                  className="overflow-x-auto rounded-lg border border-white/[0.08] bg-zinc-950/80 p-3 text-xs text-zinc-200"
                >
                  {JSON.stringify(log.payload, null, 2)}
                </pre>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
