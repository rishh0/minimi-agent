"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "@/lib/agent/events";
import type { Conversation, StoredMessage } from "@/lib/memory/store";
import { Composer } from "./components/Composer";
import { EmptyState } from "./components/EmptyState";
import { MessageView } from "./components/MessageView";
import { Sidebar } from "./components/Sidebar";
import { emptyMeta, type UIMessage } from "./components/types";

export default function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  async function refreshConversations() {
    const res = await fetch("/api/conversations");
    setConversations(await res.json());
  }

  // The open chat lives in the URL (?c=…), so a refresh keeps you where you were.
  // Updated at the moment a chat is opened/created — not in an effect, which ran on
  // mount (twice in dev) and wiped ?c= before the chat had loaded.
  function selectConversation(id: string | undefined) {
    setConversationId(id);
    window.history.replaceState(null, "", id ? `?c=${id}` : window.location.pathname);
  }

  // One toggle for both layouts: on desktop it hides/shows the sidebar (remembered
  // per browser), on phones it opens the drawer.
  function toggleSidebar() {
    if (!window.matchMedia("(min-width: 768px)").matches) return setDrawerOpen(true);
    setSidebarCollapsed((collapsed) => {
      try {
        localStorage.setItem("sidebarCollapsed", String(!collapsed));
      } catch {}
      return !collapsed;
    });
  }

  useEffect(() => {
    try {
      // Restored after mount (not in useState) so server and client render the same HTML.
      if (localStorage.getItem("sidebarCollapsed") === "true") setSidebarCollapsed(true);
    } catch {}
  }, []);

  useEffect(() => {
    refreshConversations();
    const id = new URLSearchParams(window.location.search).get("c");
    if (id) openConversation(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Follow the answer as it streams — unless the user scrolled up to read something.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  async function openConversation(id: string) {
    if (busy) return;
    setDrawerOpen(false);
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return selectConversation(undefined);
    const stored = (await res.json()) as StoredMessage[];
    selectConversation(id);
    stickToBottom.current = true;
    setMessages(
      stored.map((m) => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        sources: m.sources,
        meta: m.meta ?? emptyMeta(),
      })),
    );
  }

  function newChat() {
    if (busy) return;
    setDrawerOpen(false);
    selectConversation(undefined);
    setMessages([]);
  }

  // Apply a change to the last (assistant) message as events arrive.
  const updateLast = (change: (m: UIMessage) => UIMessage) =>
    setMessages((prev) => [...prev.slice(0, -1), change(prev[prev.length - 1])]);

  function apply(event: AgentEvent) {
    switch (event.type) {
      case "conversation":
        return selectConversation(event.id);
      case "status":
        return updateLast((m) => ({
          ...m,
          status: event.message,
          // Warnings (e.g. fallback model) stay visible after the answer finishes.
          meta: event.message.startsWith("⚠️") ? { ...m.meta, notes: [...m.meta.notes, event.message] } : m.meta,
        }));
      case "memory":
        return updateLast((m) => ({ ...m, meta: { ...m.meta, memoryFound: event.found } }));
      case "search":
        return updateLast((m) => ({
          ...m,
          meta: { ...m.meta, searches: [...m.meta.searches, { queries: event.queries, startDate: event.startDate }] },
        }));
      case "sources":
        return updateLast((m) => ({ ...m, sources: [...m.sources, ...event.sources] }));
      case "text":
        return updateLast((m) => ({ ...m, content: m.content + event.delta, status: undefined }));
      case "error":
        return updateLast((m) => ({ ...m, error: event.message, status: undefined }));
    }
  }

  async function send(text: string) {
    if (busy) return;
    const now = new Date().toISOString();
    stickToBottom.current = true;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, createdAt: now, sources: [], meta: emptyMeta() },
      { role: "assistant", content: "", createdAt: now, sources: [], meta: emptyMeta() },
    ]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

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
        signal: controller.signal,
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
        for (const line of lines) if (line) apply(JSON.parse(line) as AgentEvent);
      }
    } catch (err) {
      if (controller.signal.aborted) updateLast((m) => ({ ...m, stopped: true, status: undefined }));
      else updateLast((m) => ({ ...m, error: err instanceof Error ? err.message : "Request failed", status: undefined }));
    } finally {
      abortRef.current = null;
      setBusy(false);
      refreshConversations();
    }
  }

  return (
    <div className="flex h-dvh">
      <Sidebar
        conversations={conversations}
        activeId={conversationId}
        open={drawerOpen}
        collapsed={sidebarCollapsed}
        onClose={() => setDrawerOpen(false)}
        onOpen={openConversation}
        onNew={newChat}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 md:border-none dark:border-zinc-800">
          <button
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Show past chats" : "Hide past chats"}
            title={sidebarCollapsed ? "Show past chats" : "Hide past chats"}
            className="-ml-1 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="16" rx="2.5" />
              <path d="M9 4v16" />
            </svg>
          </button>
          <span className="font-semibold">Minimi Agent</span>
          <button
            onClick={newChat}
            className={`ml-auto text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 ${sidebarCollapsed ? "" : "md:hidden"}`}
          >
            + New chat
          </button>
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-6 pt-2">
            {messages.length === 0 ? (
              <EmptyState onPick={send} />
            ) : (
              messages.map((m, i) => <MessageView key={i} message={m} pending={busy && i === messages.length - 1} />)
            )}
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          <Composer busy={busy} onSend={send} onStop={() => abortRef.current?.abort()} />
          <p className="mt-1.5 text-center text-[11px] text-zinc-400">
            Answers come from live web search and may be wrong — check the sources.
          </p>
        </div>
      </main>
    </div>
  );
}
