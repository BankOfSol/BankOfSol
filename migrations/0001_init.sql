-- Bank of Sol — initial schema.
-- Run with:  wrangler d1 migrations apply bankofsol --local | --remote
--
-- The first four tables (user/session/account/verification) are Better Auth's
-- core schema for the SQLite/D1 adapter (pinned 1.6.23), copied from the
-- battle-tested PoundPlay setup with two changes folded in from day one:
--   * user carries BOTH admin flags (isAdmin, isSuperAdmin);
--   * account.createdAt/updatedAt have ISO-8601 defaults (PoundPlay 0016 fix —
--     adapter paths that bypass timestamp-filling must not violate NOT NULL).
-- If a Better Auth upgrade complains about the schema, regenerate with
--   npx @better-auth/cli generate
-- and reconcile diffs here.

CREATE TABLE IF NOT EXISTS "user" (
  "id"            TEXT PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "email"         TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image"         TEXT,
  "createdAt"     DATE NOT NULL,
  "updatedAt"     DATE NOT NULL,
  "isAdmin"       INTEGER NOT NULL DEFAULT 0,
  "isSuperAdmin"  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"        TEXT PRIMARY KEY,
  "expiresAt" DATE NOT NULL,
  "token"     TEXT NOT NULL UNIQUE,
  "createdAt" DATE NOT NULL,
  "updatedAt" DATE NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId"    TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                    TEXT PRIMARY KEY,
  "accountId"             TEXT NOT NULL,
  "providerId"            TEXT NOT NULL,
  "userId"                TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken"           TEXT,
  "refreshToken"          TEXT,
  "idToken"               TEXT,
  "accessTokenExpiresAt"  DATE,
  "refreshTokenExpiresAt" DATE,
  "scope"                 TEXT,
  "password"              TEXT,
  "createdAt"             DATE NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updatedAt"             DATE NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "expiresAt"  DATE NOT NULL,
  "createdAt"  DATE,
  "updatedAt"  DATE
);

-- ── Best-effort audit trail of admin mutations ──────────────────────────────
-- (approve/reject, order transitions, availability edits, admin grants...)
-- Logins are read from the Better Auth "session" table — no extra write path.
CREATE TABLE IF NOT EXISTS "admin_activity" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "actorEmail" TEXT,                 -- denormalized so a deleted admin still reads
  "action"     TEXT NOT NULL,        -- e.g. 'custody.approve', 'order.status', 'admin.grant'
  "detail"     TEXT,                 -- JSON context (target id, flags...)
  "createdAt"  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_admin_activity_created" ON "admin_activity"("createdAt");

-- ── Outbound email ledger ───────────────────────────────────────────────────
-- One row per send ATTEMPT. Subjects and outcomes ONLY — never bodies, never
-- URLs, never tokens (verification/reset links are secrets; a log that leaks
-- them is an account-takeover kit).
CREATE TABLE IF NOT EXISTS "email_log" (
  "id"        TEXT PRIMARY KEY,
  "toEmail"   TEXT NOT NULL,
  "kind"      TEXT NOT NULL,         -- 'verify' | 'welcome' | 'reset' | 'booking-confirm' | ...
  "subject"   TEXT,
  "ok"        INTEGER NOT NULL DEFAULT 0,
  "error"     TEXT,
  "note"      TEXT,
  "createdAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_email_log_created" ON "email_log"("createdAt");
