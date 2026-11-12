import { db } from "./db";
import type { DateRef } from "@/lib/time/resolve";
import { isAboutMemory, keywordQuery } from "./keywords";

// Memory retrieval runs BEFORE the model, in code — it is not a second tool.
// Reasons: the brief allows one tool (web search); it saves a model round-trip;
// and a date-range lookup is a deterministic SQL query, not a judgment call.

export type Turn = {
  conversationTitle: string;
  askedAt: string; // ISO UTC
  question: string;
  answer?: string;
};

export type MemoryResult = { searchedFor: string; turns: Turn[] };

const MAX_TURNS = 8;

export function retrieveMemory(input: {
  message: string;
  dateRefs: DateRef[];
  excludeConversationId: string; // the current chat is already in the history
}): MemoryResult | null {
  if (!isAboutMemory(input.message)) return null;

  const keywords = keywordQuery(input.message);
  const ranges = input.dateRefs.length ? input.dateRefs : [null];
  const userIds = new Set<number>();

  for (const range of ranges) {
    // 1) Best: keyword matches inside the date range. 2) Date range alone.
    // 3) No date mentioned: keyword matches across all history.
    let ids = keywords ? searchIds(keywords, range, input.excludeConversationId) : [];
    if (!ids.length && range) ids = rangeIds(range, input.excludeConversationId);
    ids.forEach((id) => userIds.add(id));
  }

  const searchedFor = [
    ...input.dateRefs.map((r) => r.label),
    ...(keywords ? [`keywords: ${keywords.replaceAll('"', "")}`] : []),
  ].join("; ");

  const turns = [...userIds]
    .sort((a, b) => a - b)
    .slice(0, MAX_TURNS)
    .map(turnFor)
    .filter((t): t is Turn => t !== null);
  return { searchedFor: searchedFor || "all past conversations", turns };
}

// ---- SQL ----

type Range = Pick<DateRef, "startUtc" | "endUtc"> | null;

// FTS hits can be user or assistant messages; map each hit to the user question it belongs to.
function searchIds(match: string, range: Range, exclude: string): number[] {
  const rows = db
    .prepare(
      `SELECT m.id, m.role, m.conversation_id AS conv
         FROM messages_fts f JOIN messages m ON m.id = f.rowid
        WHERE messages_fts MATCH ?
          AND m.conversation_id != ?
          AND (? IS NULL OR (m.created_at >= ? AND m.created_at < ?))
        ORDER BY bm25(messages_fts)
        LIMIT 20`,
    )
    .all(match, exclude, range?.startUtc ?? null, range?.startUtc ?? null, range?.endUtc ?? null) as {
    id: number;
    role: string;
    conv: string;
  }[];
  return rows.map((r) => (r.role === "user" ? r.id : precedingUserId(r.conv, r.id))).filter((id) => id !== null);
}

function rangeIds(range: NonNullable<Range>, exclude: string): number[] {
  return (
    db
      .prepare(
        `SELECT id FROM messages
          WHERE role = 'user' AND conversation_id != ? AND created_at >= ? AND created_at < ?
          ORDER BY id LIMIT ?`,
      )
      .all(exclude, range.startUtc, range.endUtc, MAX_TURNS) as { id: number }[]
  ).map((r) => r.id);
}

function precedingUserId(conversationId: string, id: number): number | null {
  const row = db
    .prepare("SELECT id FROM messages WHERE conversation_id = ? AND id < ? AND role = 'user' ORDER BY id DESC LIMIT 1")
    .get(conversationId, id) as { id: number } | undefined;
  return row?.id ?? null;
}

function turnFor(userId: number): Turn | null {
  const q = db
    .prepare(
      `SELECT m.content, m.created_at, m.conversation_id AS conv, c.title
         FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ?`,
    )
    .get(userId) as { content: string; created_at: string; conv: string; title: string } | undefined;
  if (!q) return null;
  const a = db
    .prepare("SELECT content FROM messages WHERE conversation_id = ? AND id > ? AND role = 'assistant' ORDER BY id LIMIT 1")
    .get(q.conv, userId) as { content: string } | undefined;
  return { conversationTitle: q.title, askedAt: q.created_at, question: q.content, answer: a?.content };
}
