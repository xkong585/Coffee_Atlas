import "server-only";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type Client, createClient } from "@libsql/client";

/**
 * User data store: SQLite through libSQL. Locally DATABASE_URL is a file
 * (`file:./data/coffee-atlas.db`); hosted, it is a Turso URL
 * (`libsql://…`) with DATABASE_AUTH_TOKEN. The catalog is not stored here; it
 * is versioned with the code (src/modules/catalog/data/).
 *
 * The schema is created on first use, so a fresh database needs no separate
 * migration step. Every statement is idempotent.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS saved_items (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('bean', 'drink')),
  item_id TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_type, item_id)
);
CREATE TABLE IF NOT EXISTS recommendation_usage (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS checkout_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'processing', 'paid', 'failed', 'expired')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entitlements (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  checkout_session_id TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, capability)
);
CREATE TABLE IF NOT EXISTS login_failures (
  email TEXT NOT NULL,
  failed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS login_failures_by_email ON login_failures(email, failed_at);
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TEXT NOT NULL
);
`;

/** Opens a client and creates the schema once; a failed setup is retried on the next call. */
export function databaseOpener(open: () => Client | null): () => Promise<Client | null> {
  let ready: Promise<Client | null> | null = null;
  return () => {
    ready ??= (async () => {
      const client = open();
      if (!client) return null;
      await client.executeMultiple(SCHEMA);
      return client;
    })().catch((error: unknown) => {
      ready = null;
      throw error;
    });
    return ready;
  };
}

function openFromEnvironment(): Client | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (url.startsWith("file:")) {
    const path = url.slice("file:".length);
    if (path && path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  }
  return createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || undefined });
}

export const openDatabase = databaseOpener(openFromEnvironment);
