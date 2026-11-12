import type { Source } from "@/lib/tools/webSearch";

// The wire protocol between server and browser: one JSON object per line (NDJSON).
// Starting with typed events (not raw text) means later steps can add
// "searching…" status and sources without changing the transport.
export type AgentEvent =
  | { type: "conversation"; id: string }
  | { type: "status"; message: string }
  | { type: "sources"; sources: Source[] }
  | { type: "text"; delta: string }
  | { type: "error"; message: string }
  | { type: "done" };

export type ChatMessage = { role: "user" | "assistant"; content: string };
