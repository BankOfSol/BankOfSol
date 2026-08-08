-- Custody applications (the Phase-1 waitlist behind the locked vault teaser).
-- A separate table rather than user columns: approval metadata doesn't fit
-- boolean flags, the Better Auth table stays pristine, and the gate reads
-- fresh state instead of a stale session cache. The on-chain vault tables
-- (addresses, deposits, withdrawals) arrive with Phase 3 in 0006.

CREATE TABLE IF NOT EXISTS "custody_account" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE,
  "status"     TEXT NOT NULL DEFAULT 'applied'
                 CHECK ("status" IN ('applied','approved','rejected','suspended','closed')),
  "motivation" TEXT,                  -- what they want to custody, in their words
  "adminNote"  TEXT,
  "appliedAt"  TEXT NOT NULL,
  "decidedAt"  TEXT,
  "decidedBy"  TEXT,                  -- admin email, denormalized
  "createdAt"  TEXT NOT NULL,
  "updatedAt"  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_custody_status" ON "custody_account"("status","appliedAt");
