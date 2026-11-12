"use client";

import type { Conversation } from "@/lib/memory/store";

// Group by how long ago — the agent is about "what you asked and when", so the list shows it.
function groupOf(iso: string): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  return "Older";
}

export function Sidebar(props: {
  conversations: Conversation[];
  activeId?: string;
  open: boolean; // mobile drawer
  onClose: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const groups = new Map<string, Conversation[]>();
  for (const c of props.conversations) {
    const g = groupOf(c.createdAt);
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }

  return (
    <>
      {props.open && <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={props.onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-zinc-200 bg-zinc-50 p-3 transition-transform md:static md:w-64 md:translate-x-0 dark:border-zinc-800 dark:bg-zinc-950 ${
          props.open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={props.onNew}
          className="mb-4 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          + New chat
        </button>
        <nav className="flex-1 space-y-4 overflow-y-auto">
          {props.conversations.length === 0 && <p className="px-2 text-xs text-zinc-500">No conversations yet.</p>}
          {[...groups].map(([label, items]) => (
            <div key={label}>
              <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">{label}</p>
              {items.map((c) => (
                <button
                  key={c.id}
                  onClick={() => props.onOpen(c.id)}
                  title={c.title}
                  className={`block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 ${
                    c.id === props.activeId ? "bg-zinc-200/80 font-medium dark:bg-zinc-800" : ""
                  }`}
                >
                  {c.title}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
