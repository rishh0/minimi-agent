"use client";

import { useState } from "react";
import { normalizeCitations } from "@/lib/agent/citations";
import { formatTime } from "./format";
import { Markdown } from "./Markdown";
import { SourceChips } from "./SourceChips";
import { Steps } from "./Steps";
import type { UIMessage } from "./types";

export function MessageView({ message, pending }: { message: UIMessage; pending: boolean }) {
  const [copied, setCopied] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-zinc-100 px-4 py-2.5 dark:bg-zinc-800">
          {message.content}
        </div>
        <span className="mt-1 text-[11px] text-zinc-400">{formatTime(message.createdAt)}</span>
      </div>
    );
  }

  async function copy() {
    await navigator.clipboard.writeText(normalizeCitations(message.content));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const done = !pending && !message.status;
  return (
    <div className="group">
      <Steps meta={message.meta} sourceCount={message.sources.length} status={message.status} />
      {message.content ? (
        <Markdown text={message.content} sources={message.sources} />
      ) : pending && !message.status ? (
        <span className="inline-block size-2 animate-pulse rounded-full bg-zinc-400" />
      ) : null}
      {message.stopped && <p className="mt-2 text-xs text-zinc-500">Stopped.</p>}
      {message.error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {message.error}
        </div>
      )}
      {done && <SourceChips sources={message.sources} />}
      {done && message.content && (
        <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-400 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          <span>{formatTime(message.createdAt)}</span>
          <button onClick={copy} className="hover:text-zinc-700 dark:hover:text-zinc-200">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
