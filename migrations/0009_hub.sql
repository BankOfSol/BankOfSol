-- Sol's command center (Super Admin → the hub). Bank of Sol becomes Sol's
-- central place: the "ecosystems" (income streams) that the sun feeds, the
-- money each one brings in, shared goals Sol and Ray work on, and Ray's
-- notes back to Sol (briefings, advice, alerts). Ray reads and writes through
-- /api/ray/hub with the same shared token as the receipt scanner.

-- ── Ecosystems: the income streams orbiting the sun ────────────────────────
CREATE TABLE IF NOT EXISTS "ecosystem" (
  "id"                 TEXT PRIMARY KEY,
  "slug"               TEXT NOT NULL UNIQUE,
  "name"               TEXT NOT NULL,
  "tagline"            TEXT,
  "status"             TEXT NOT NULL DEFAULT 'building'
                         CHECK ("status" IN ('seed','building','live','paused','closed')),
  "color"              TEXT NOT NULL DEFAULT '#ff6b1a',   -- node color on the solar map
  "url"                TEXT,
  "monthlyTargetCents" INTEGER NOT NULL DEFAULT 0,
  "sortOrder"          INTEGER NOT NULL DEFAULT 0,
  "notes"              TEXT,
  "createdAt"          TEXT NOT NULL,
  "updatedAt"          TEXT NOT NULL
);

-- ── Income log: signed cents per ecosystem (negative = an expense) ─────────
CREATE TABLE IF NOT EXISTS "income_entry" (
  "id"          TEXT PRIMARY KEY,
  "ecosystemId" TEXT NOT NULL REFERENCES "ecosystem"("id") ON DELETE CASCADE,
  "amountCents" INTEGER NOT NULL,
  "occurredOn"  TEXT NOT NULL,                       -- 'YYYY-MM-DD'
  "source"      TEXT,                                -- 'door', 'stripe', 'consulting', …
  "note"        TEXT,
  "createdBy"   TEXT NOT NULL,
  "createdAt"   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_income_eco" ON "income_entry"("ecosystemId","occurredOn");

-- ── Goals Sol and Ray share ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "goal" (
  "id"            TEXT PRIMARY KEY,
  "ecosystemId"   TEXT REFERENCES "ecosystem"("id") ON DELETE SET NULL,
  "title"         TEXT NOT NULL,
  "detail"        TEXT,
  "targetCents"   INTEGER,                           -- NULL = not a money goal
  "progressCents" INTEGER NOT NULL DEFAULT 0,
  "progressPct"   INTEGER NOT NULL DEFAULT 0 CHECK ("progressPct" BETWEEN 0 AND 100),
  "targetDate"    TEXT,                              -- 'YYYY-MM-DD'
  "owner"         TEXT NOT NULL DEFAULT 'both' CHECK ("owner" IN ('sol','ray','both')),
  "status"        TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','done','dropped')),
  "rayNote"       TEXT,                              -- Ray's latest take on this goal
  "rayNoteAt"     TEXT,
  "createdAt"     TEXT NOT NULL,
  "updatedAt"     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_goal_status" ON "goal"("status","targetDate");

-- ── Ray's notes to Sol ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ray_note" (
  "id"          TEXT PRIMARY KEY,
  "kind"        TEXT NOT NULL DEFAULT 'advice' CHECK ("kind" IN ('briefing','advice','alert','win')),
  "title"       TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "goalId"      TEXT REFERENCES "goal"("id") ON DELETE SET NULL,
  "ecosystemId" TEXT REFERENCES "ecosystem"("id") ON DELETE SET NULL,
  "model"       TEXT,
  "readAt"      TEXT,
  "dismissedAt" TEXT,
  "createdAt"   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_ray_note_unread" ON "ray_note"("readAt","createdAt");

-- ── Seed: the ecosystems the sun already feeds (idempotent by slug) ────────
INSERT OR IGNORE INTO "ecosystem" ("id","slug","name","tagline","status","color","url","monthlyTargetCents","sortOrder","createdAt","updatedAt") VALUES
  (lower(hex(randomblob(16))),'pound','POUND','Monthly 18+ queer kink & play party — the first tendril','live','#ff3d6e','https://poundplay.com',0,0,datetime('now'),datetime('now')),
  (lower(hex(randomblob(16))),'bank-of-sol','Bank of Sol','The hub itself: members, ledger, reimbursements','live','#ffb224','https://bankofsol.app',0,1,datetime('now'),datetime('now')),
  (lower(hex(randomblob(16))),'sol-and-ray','Sol & Ray','Automated reference checks for school districts','building','#4fd8ff','https://solandray.com',0,2,datetime('now'),datetime('now')),
  (lower(hex(randomblob(16))),'kennel-club','Kennel Club','THE YARD / THE LOT — the game','building','#9b7bff',NULL,0,3,datetime('now'),datetime('now')),
  (lower(hex(randomblob(16))),'shop','Shop','Things Sol makes — prints, desk stands','paused','#2ee59d','https://shop.bankofsol.app',0,4,datetime('now'),datetime('now'));
