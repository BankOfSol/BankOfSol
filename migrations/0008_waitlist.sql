-- The public site is now just the sun, a login button, and a waitlist. This
-- is the waitlist: an email (and optional name/note) from someone who wants
-- in. Sol reviews it in Admin → Waitlist and invites people by hand — no
-- account is created here, no money is involved.
CREATE TABLE IF NOT EXISTS "waitlist" (
  "id"        TEXT PRIMARY KEY,
  "email"     TEXT NOT NULL UNIQUE,
  "name"      TEXT,
  "note"      TEXT,
  "ip"        TEXT,
  "source"    TEXT,
  "status"    TEXT NOT NULL DEFAULT 'new' CHECK ("status" IN ('new','invited','closed')),
  "adminNote" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_waitlist_status" ON "waitlist"("status","createdAt");
