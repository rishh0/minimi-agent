import type { Source } from "@/lib/tools/webSearch";

// The wire protocol between server and browser: one JSON object per line (NDJSON).
// Starting with typed events (not raw text) means later steps can add
// "searching…" status and sources without changing the transport.
export type AgentEvent =
  | { type: "conversation"; id: string }
  | { type: "status"; message: string } // human-readable progress, shown in the UI
  | { type: "memory"; found: number } // machine-readable twins of the statuses,
  | { type: "search"; queries: string[]; startDate?: string } // for evals and logs
  | { type: "sources"; sources: Source[] }
  | { type: "text"; delta: string }
  | { type: "error"; message: string }
  | { type: "done" };

export type ChatMessage = { role: "user" | "assistant"; content: string };
