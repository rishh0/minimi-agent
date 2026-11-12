"use client";

import { useState } from "react";
import type { Source } from "@/lib/tools/webSearch";
import { domainOf } from "./format";

const VISIBLE = 6;

export function SourceChips({ sources }: { sources: Source[] }) {
  const [all, setAll] = useState(false);
  if (!sources.length) return null;
  const shown = all ? sources : sources.slice(0, VISIBLE);
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {shown.map((s) => (
        <a
          key={s.id}
          href={s.url}
          target="_blank"
          rel="noreferrer"
          title={s.title}
          className="max-w-[14rem] truncate rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
        >
          <span className="text-zinc-400">[{s.id}]</span> {domainOf(s.url)}
        </a>
      ))}
      {sources.length > VISIBLE && (
        <button onClick={() => setAll(!all)} className="px-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          {all ? "show less" : `+${sources.length - VISIBLE} more`}
        </button>
      )}
    </div>
  );
}
