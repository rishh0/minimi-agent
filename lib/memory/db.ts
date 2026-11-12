import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// A local file: zero setup for whoever clones the repo (no DB server to run).
// DB_PATH=:memory: gives evals a fresh, throwaway database.
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data", "minimi.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL            -- ISO 8601, UTC
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  sources         TEXT,               -- JSON array of sources (assistant messages)
  created_at      TEXT NOT NULL       -- ISO 8601, UTC
);
CREATE INDEX IF NOT EXISTS messages_by_time ON messages(created_at);
CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages(conversation_id, id);

-- Full-text index over message content (keyword search: "Postgres hosting").
-- Messages are append-only, so an insert trigger is all it needs to stay in sync.
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content, content='messages', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
END;
`;

function open() {
  if (DB_PATH !== ":memory:") fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL"); // readers don't block the writer
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

// Next.js dev mode re-imports modules on every edit; keep one connection alive across reloads.
const globalForDb = globalThis as unknown as { db?: Database.Database };
export const db = (globalForDb.db ??= open());
