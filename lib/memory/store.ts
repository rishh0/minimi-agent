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
): number {
  const result = db
    .prepare("INSERT INTO messages (conversation_id, role, content, sources, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(conversationId, role, content, sources.length ? JSON.stringify(sources) : null, now().toISOString());
  return Number(result.lastInsertRowid);
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

export type Claim = { entity: string; attribute: string; value: string; sourceUrl: string | null; observedAt: string };

export function saveClaims(messageId: number, claims: Omit<Claim, "observedAt">[], observedAt: string) {
  const insert = db.prepare(
    "INSERT INTO claims (message_id, entity, attribute, value, source_url, observed_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  // One transaction: all claims for an answer are saved, or none are.
  db.transaction(() => {
    for (const c of claims) insert.run(messageId, c.entity, c.attribute, c.value, c.sourceUrl, observedAt);
  })();
}

export function getClaims(messageId: number): Claim[] {
  return db
    .prepare(
      `SELECT entity, attribute, value, source_url AS sourceUrl, observed_at AS observedAt
         FROM claims WHERE message_id = ? ORDER BY entity, id`,
    )
    .all(messageId) as Claim[];
}
