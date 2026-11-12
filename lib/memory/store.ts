import { randomUUID } from "node:crypto";
import { db } from "./db";
import { now } from "@/lib/time/clock";
import type { Source } from "@/lib/tools/webSearch";

export type StoredMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
  createdAt: string;
};

export type Conversation = { id: string; title: string; createdAt: string };

export function createConversation(firstMessage: string): string {
  const id = randomUUID();
  const title = firstMessage.length > 60 ? firstMessage.slice(0, 57) + "…" : firstMessage;
  db.prepare("INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?)").run(
    id,
    title,
    now().toISOString(),
  );
  return id;
}

export function conversationExists(id: string): boolean {
  return db.prepare("SELECT 1 FROM conversations WHERE id = ?").get(id) !== undefined;
}

export function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  sources: Source[] = [],
) {
  db.prepare(
    "INSERT INTO messages (conversation_id, role, content, sources, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(conversationId, role, content, sources.length ? JSON.stringify(sources) : null, now().toISOString());
}

type MessageRow = { id: number; role: "user" | "assistant"; content: string; sources: string | null; created_at: string };

export function getMessages(conversationId: string): StoredMessage[] {
  const rows = db
    .prepare("SELECT id, role, content, sources, created_at FROM messages WHERE conversation_id = ? ORDER BY id")
    .all(conversationId) as MessageRow[];
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    sources: r.sources ? JSON.parse(r.sources) : [],
    createdAt: r.created_at,
  }));
}

export function listConversations(): Conversation[] {
  return db
    .prepare("SELECT id, title, created_at AS createdAt FROM conversations ORDER BY created_at DESC")
    .all() as Conversation[];
}
