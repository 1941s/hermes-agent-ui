"use client";

import { useMemo, useState } from "react";
import { UI_TEXT } from "@hermes-ui/config/ui-text";

import { MarkdownPreview } from "@/components/markdown-preview";
import type { AgentFrame } from "@/hooks/use-agent";

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

function renderArtifact(payload: ArtifactPayload) {
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
      <pre className="overflow-x-auto rounded border bg-zinc-900 p-2 text-xs text-zinc-200">
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
          <div className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
            {UI_TEXT.labels.policyBlocked}
            {payload.block_reason ? ` ${UI_TEXT.labels.blockReason}: ${payload.block_reason}` : ""}
          </div>
          <pre className="overflow-x-auto rounded border bg-zinc-900 p-2 text-xs text-zinc-200">
            {content}
          </pre>
        </div>
      );
    }
    return (
      <iframe
        className="h-56 w-full rounded border bg-white"
        sandbox=""
        srcDoc={content}
        title={payload.artifact_id ?? "artifact-html"}
      />
    );
  }

  if (artifactType === "image_url") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt="artifact" className="max-h-64 rounded border object-contain" src={content} />
    );
  }

  return (
    <pre className="overflow-x-auto rounded border bg-zinc-900 p-2 text-xs text-zinc-200">
      {content}
    </pre>
  );
}

export function ArtifactsPreview({ frames, responseText }: Props) {
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

  return (
    <div className="flex min-h-0 grow flex-col rounded-lg border bg-zinc-950/40">
      <div className="flex gap-2 border-b p-2 text-xs">
        <button
          className={`rounded px-2 py-1 ${mode === "preview" ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-300"}`}
          onClick={() => setMode("preview")}
          type="button"
        >
          {UI_TEXT.labels.preview}
        </button>
        <button
          className={`rounded px-2 py-1 ${mode === "artifacts" ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-300"}`}
          onClick={() => setMode("artifacts")}
          type="button"
        >
          {UI_TEXT.labels.artifacts}
        </button>
        <button
          className={`rounded px-2 py-1 ${mode === "tools" ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-300"}`}
          onClick={() => setMode("tools")}
          type="button"
        >
          {UI_TEXT.labels.toolLogs}
        </button>
      </div>
      <div className="min-h-0 grow overflow-auto p-3 text-sm">
        {mode === "preview" ? (
          <MarkdownPreview content={responseText} />
        ) : mode === "artifacts" ? (
          <div className="space-y-2">
            {artifacts.length === 0 ? (
              <div className="text-xs text-zinc-400">{UI_TEXT.labels.noToolLogs}</div>
            ) : (
              artifacts.map((item) => (
                <div key={item.key} className="space-y-2 rounded border bg-zinc-900/60 p-2">
                  <div className="text-xs text-zinc-400">
                    {(item.payload.source_tool ?? "tool").toString()} · {item.payload.artifact_type ?? "text"}
                  </div>
                  {item.payload.truncated ? (
                    <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
                      {UI_TEXT.labels.truncatedByServer} {UI_TEXT.labels.originalLength}: {item.payload.original_length ?? "unknown"}
                    </div>
                  ) : null}
                  {renderArtifact(item.payload)}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {toolLogs.length === 0 ? (
              <div className="text-xs text-zinc-400">{UI_TEXT.labels.noToolLogs}</div>
            ) : (
              toolLogs.map((log) => (
                <pre key={log.key} className="overflow-x-auto rounded border bg-zinc-900 p-2 text-xs text-zinc-200">
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
