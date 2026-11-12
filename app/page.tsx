"use client";

import { useRef, useState } from "react";
import type { AgentEvent, ChatMessage } from "@/lib/agent/events";
import type { Source } from "@/lib/tools/webSearch";

// gpt-oss sometimes emits its training-time citation style 【3†L1-L4】 despite the
// prompt. Normalize at render time (not mid-stream, where a marker can be split).
const normalizeCitations = (text: string) => text.replace(/【(\d+)†[^】]*】/g, "[$1]");

// What the UI shows per message. Only role + content are sent back to the server.
type UIMessage = ChatMessage & { status?: string; sources?: Source[] };

export default function Chat() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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

    const history: ChatMessage[] = [
      ...messages.map(({ role, content }) => ({ role, content })),
      { role: "user", content: text },
    ];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.body) throw new Error("No response body");

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
    }
  }

  return (
    <main className="mx-auto flex h-screen w-full max-w-2xl flex-col px-4">
      <header className="py-4 text-lg font-semibold">Minimi Agent</header>

      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <p className="pt-24 text-center text-zinc-500">Ask me anything.</p>
        )}
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
                      <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-zinc-800 dark:hover:text-zinc-200">
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
  );
}
