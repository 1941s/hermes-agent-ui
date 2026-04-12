"use client";

import { codeToHtml } from "shiki";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import { memo, useEffect, useState } from "react";
import remarkGfm from "remark-gfm";

type ShikiBlockProps = {
  code: string;
  language: string;
};

const ShikiFencedCode = memo(function ShikiFencedCode({ code, language }: ShikiBlockProps) {
  const [html, setHtml] = useState<string>("");

  useEffect(() => {
    let active = true;
    const lang = language && language.length > 0 ? language : "text";
    codeToHtml(code, {
      lang,
      theme: "github-dark-default",
    }).then((h) => {
      if (active) setHtml(h);
    });
    return () => {
      active = false;
    };
  }, [code, language]);

  if (!html) {
    return (
      <pre className="my-3 overflow-x-auto rounded-lg border border-[var(--border-hairline)] bg-zinc-950/80 p-3 font-mono text-[13px] text-zinc-400">
        <code>{code}</code>
      </pre>
    );
  }

  return (
    <div
      className="hermes-chat-code my-3 overflow-x-auto rounded-lg border border-[var(--border-hairline)] bg-zinc-950/50 [&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:bg-transparent [&_pre]:p-3 [&_pre]:text-[13px] [&_pre]:leading-relaxed"
      // eslint-disable-next-line react/no-danger -- Shiki output is generated locally, no user HTML
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

const inlineCodeClass =
  "rounded-md border border-white/[0.06] bg-zinc-800/90 px-1.5 py-0.5 font-mono text-[0.88em] text-emerald-100/95";

function CodeBlock({
  className,
  children,
  node: _node,
  ...rest
}: React.ClassAttributes<HTMLElement> &
  React.HTMLAttributes<HTMLElement> & {
    node?: unknown;
  }) {
  const code = String(children).replace(/\n$/, "");
  const match = /language-([\w-]+)/.exec(className ?? "");
  /** react-markdown v10 不再传 `inline`；围栏可无语言或含换行 */
  const isBlock = Boolean(match) || code.includes("\n");
  if (!isBlock) {
    return (
      <code className={inlineCodeClass} {...rest}>
        {children}
      </code>
    );
  }
  const language = match ? match[1] : "text";
  return <ShikiFencedCode code={code} language={language} />;
}

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: CodeBlock as Components["code"],
  a: ({ href, children, ...rest }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-sky-400/95 underline decoration-sky-500/40 underline-offset-2 transition hover:text-sky-300 hover:decoration-sky-400/60"
      {...rest}
    >
      {children}
    </a>
  ),
  h1: ({ children, ...rest }) => (
    <h1 className="mb-3 mt-6 border-b border-[var(--border-hairline)] pb-2 text-lg font-semibold tracking-tight text-zinc-100 first:mt-0" {...rest}>
      {children}
    </h1>
  ),
  h2: ({ children, ...rest }) => (
    <h2 className="mb-2 mt-5 text-[1.05rem] font-semibold tracking-tight text-zinc-100 first:mt-0" {...rest}>
      {children}
    </h2>
  ),
  h3: ({ children, ...rest }) => (
    <h3 className="mb-2 mt-4 text-[15px] font-semibold text-zinc-200 first:mt-0" {...rest}>
      {children}
    </h3>
  ),
  p: ({ children, ...rest }) => (
    <p className="mb-3 last:mb-0 [&+p]:mt-0" {...rest}>
      {children}
    </p>
  ),
  ul: ({ children, ...rest }) => (
    <ul className="mb-3 list-disc space-y-1.5 pl-5 text-zinc-200/95 marker:text-zinc-500" {...rest}>
      {children}
    </ul>
  ),
  ol: ({ children, ...rest }) => (
    <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-zinc-200/95 marker:text-zinc-500" {...rest}>
      {children}
    </ol>
  ),
  li: ({ children, ...rest }) => (
    <li className="leading-relaxed [&_p]:mb-0" {...rest}>
      {children}
    </li>
  ),
  blockquote: ({ children, ...rest }) => (
    <blockquote
      className="mb-3 border-l-2 border-zinc-600/80 bg-zinc-900/30 py-1 pl-4 text-zinc-400 [&_p]:mb-2 [&_p:last-child]:mb-0"
      {...rest}
    >
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-[var(--border-hairline)]" />,
  table: ({ children, ...rest }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-[var(--border-hairline)]">
      <table className="w-full min-w-[280px] border-collapse text-left text-[13px]" {...rest}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...rest }) => (
    <thead className="border-b border-[var(--border-hairline)] bg-zinc-900/60" {...rest}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...rest }) => <tbody {...rest}>{children}</tbody>,
  tr: ({ children, ...rest }) => (
    <tr className="border-b border-[var(--border-hairline)]/60 last:border-0" {...rest}>
      {children}
    </tr>
  ),
  th: ({ children, ...rest }) => (
    <th className="px-3 py-2 font-semibold text-zinc-200" {...rest}>
      {children}
    </th>
  ),
  td: ({ children, ...rest }) => (
    <td className="px-3 py-2 text-zinc-300/95" {...rest}>
      {children}
    </td>
  ),
};

export function ChatMarkdown({ content }: { content: string }) {
  const trimmed = content?.trim() ?? "";
  if (!trimmed) {
    return <span className="inline-block min-h-[1.25em] text-zinc-500"> </span>;
  }

  return (
    <div className="hermes-chat-prose max-w-none text-[15px] leading-[1.75] text-[var(--prose-body)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {trimmed}
      </ReactMarkdown>
    </div>
  );
}
