"use client";

import { codeToHtml } from "shiki";
import { useEffect, useState } from "react";

const CODE_BLOCK_REGEX = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function toHtml(markdown: string): Promise<string> {
  const chunks: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;

  while ((match = CODE_BLOCK_REGEX.exec(markdown)) !== null) {
    const [full, language = "text", code = ""] = match;
    const index = match.index;
    const textBefore = markdown.slice(lastIndex, index);
    if (textBefore.trim()) {
      chunks.push(`<p>${escapeHtml(textBefore).replaceAll("\n", "<br/>")}</p>`);
    }
    const highlighted = await codeToHtml(code, {
      lang: language || "text",
      theme: "github-dark-default",
    });
    chunks.push(highlighted);
    lastIndex = index + full.length;
  }

  const tail = markdown.slice(lastIndex);
  if (tail.trim()) {
    chunks.push(`<p>${escapeHtml(tail).replaceAll("\n", "<br/>")}</p>`);
  }
  return chunks.join("\n");
}

export function MarkdownPreview({ content }: { content: string }) {
  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    let active = true;
    toHtml(content || "").then((next) => {
      if (active) setHtml(next);
    });
    return () => {
      active = false;
    };
  }, [content]);

  return (
    <article
      className="max-w-none text-[15px] leading-[1.7] text-[var(--prose-body)] [&_p]:mb-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-[var(--border-hairline)]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
