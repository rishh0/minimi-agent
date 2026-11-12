"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/agent/events";
import { normalizeCitations } from "@/lib/agent/citations";
import type { Conversation, StoredMessage } from "@/lib/memory/store";
import type { Source } from "@/lib/tools/webSearch";

type UIMessage = { role: "user" | "assistant"; content: string; status?: string; sources?: Source[] };

export default function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function refreshConversations() {
    const res = await fetch("/api/conversations");
    setConversations(await res.json());
  }

  useEffect(() => {
    // Initial load of the sidebar; data comes from our own API, not render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshConversations();
  }, []);

  async function openConversation(id: string) {
    if (busy) return;
    const res = await fetch(`/api/conversations/${id}`);
    const stored = (await res.json()) as StoredMessage[];
    setConversationId(id);
    setMessages(stored.map(({ role, content, sources }) => ({ role, content, sources })));
  }

  function newChat() {
    if (busy) return;
    setConversationId(undefined);
    setMessages([]);
  }

  // Apply a change to the last (assistant) message as events arrive.
  function updateLast(change: (m: UIMessage) => UIMessage) {
    setMessages((prev) => [...prev.slice(0, -1), change(prev[prev.length - 1])]);
    bottomRef.current?.scrollIntoView({ block: "end" });
  }
  const appendToLast = (text: string) =>
    updateLast((m) => ({ ...m, content: m.content + text, status: undefined }));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    try {
      // The server owns the history: we only send the new message + which conversation.
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          message: text,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

      // Read the NDJSON stream: chunks can split lines, so buffer until "\n".
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop()!; // keep the incomplete last line for the next chunk
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as AgentEvent;
          if (event.type === "conversation") setConversationId(event.id);
          if (event.type === "text") appendToLast(event.delta);
          if (event.type === "status") updateLast((m) => ({ ...m, status: event.message }));
          if (event.type === "sources")
            updateLast((m) => ({ ...m, sources: [...(m.sources ?? []), ...event.sources] }));
          if (event.type === "error") appendToLast(`\n\n⚠️ ${event.message}`);
        }
      }
    } catch (err) {
      appendToLast(`\n\n⚠️ ${err instanceof Error ? err.message : "Request failed"}`);
    } finally {
      setBusy(false);
      refreshConversations();
    }
  }

  return (
    <div className="flex h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-zinc-200 p-3 md:flex dark:border-zinc-800">
        <button
          onClick={newChat}
          className="mb-3 rounded-lg border border-zinc-300 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          + New chat
        </button>
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => openConversation(c.id)}
              className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
                c.id === conversationId ? "bg-zinc-100 dark:bg-zinc-900" : ""
              }`}
            >
              {c.title}
              <span className="block text-xs text-zinc-500">{new Date(c.createdAt).toLocaleDateString()}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="mx-auto flex h-screen w-full max-w-2xl flex-col px-4">
        <header className="flex items-center justify-between py-4">
          <span className="text-lg font-semibold">Minimi Agent</span>
          <button onClick={newChat} className="text-sm text-zinc-500 md:hidden">
            + New chat
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto pb-4">
          {messages.length === 0 && <p className="pt-24 text-center text-zinc-500">Ask me anything.</p>}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl bg-zinc-200 px-4 py-2 dark:bg-zinc-800"
                    : "whitespace-pre-wrap leading-relaxed"
                }
              >
                {m.status && <p className="text-sm text-zinc-500">🔎 {m.status}</p>}
                {normalizeCitations(m.content) || (busy && i === messages.length - 1 && !m.status ? "…" : "")}
                {m.sources && m.sources.length > 0 && (
                  <ol className="mt-3 space-y-1 border-t border-zinc-200 pt-2 text-sm dark:border-zinc-800">
                    {m.sources.map((s) => (
                      <li key={s.id} className="truncate text-zinc-500">
                        [{s.id}]{" "}
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-zinc-800 dark:hover:text-zinc-200"
                        >
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} className="flex gap-2 py-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message…"
            className="flex-1 rounded-xl border border-zinc-300 bg-transparent px-4 py-3 outline-none focus:border-zinc-500 dark:border-zinc-700"
          />
          <button
            disabled={busy || !input.trim()}
            className="rounded-xl bg-zinc-900 px-5 text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
