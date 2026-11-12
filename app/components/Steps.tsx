"use client";

import { useState } from "react";
import type { TurnMeta } from "@/lib/memory/store";

// "What the agent did": a live line while it works, then a one-line summary that
// expands to show the exact memory lookup and search queries. Makes the pipeline visible.
export function Steps({ meta, sourceCount, status }: { meta: TurnMeta; sourceCount: number; status?: string }) {
  const [open, setOpen] = useState(false);
  const queries = meta.searches.flatMap((s) => s.queries);
  const parts: string[] = [];
  if (meta.memoryFound !== undefined)
    parts.push(
      meta.memoryFound
        ? `📚 Found ${meta.memoryFound} past question${meta.memoryFound > 1 ? "s" : ""}`
        : "📚 No matching past conversation",
    );
  if (queries.length) parts.push(`🔎 ${queries.length} search${queries.length > 1 ? "es" : ""}`);
  if (sourceCount) parts.push(`${sourceCount} sources`);

  if (status) {
    return (
      <div className="mb-2 flex items-center gap-2 text-sm text-zinc-500">
        <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-300" />
        <span className="truncate">{status}</span>
      </div>
    );
  }
  if (!parts.length && !meta.notes.length) return null;

  return (
    <div className="mb-2 text-xs text-zinc-500">
      {meta.notes.map((n) => (
        <p key={n} className="mb-1 text-amber-600 dark:text-amber-400">
          {n}
        </p>
      ))}
      {parts.length > 0 && (
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1 hover:text-zinc-800 dark:hover:text-zinc-200">
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          {parts.join(" · ")}
        </button>
      )}
      {open && (
        <ul className="mt-1.5 space-y-1 border-l border-zinc-200 pl-3 dark:border-zinc-800">
          {meta.memoryFound !== undefined && (
            <li>Looked up past conversations in local memory before answering.</li>
          )}
          {meta.searches.map((s, i) => (
            <li key={i}>
              Search round {i + 1}
              {s.startDate ? ` (news since ${s.startDate})` : ""}:
              <ul className="mt-0.5 list-disc pl-4">
                {s.queries.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
