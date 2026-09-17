-- The hub learns to listen. Ray pulls from outside sources (Stripe, the
-- poundplay.com stats endpoint, chain explorers, Cloudflare Analytics) and
-- posts what it finds here: money as income entries keyed by source +
-- external id (so re-syncs never double count), everything else as metrics
-- (latest value per source/key). Claims get a chain check slot so the
-- admin sees "0.52 SOL landed at our address ≈ $61" before confirming.

-- ── Income: imported entries carry the source system's id ────────────────
ALTER TABLE "income_entry" ADD COLUMN "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_income_external"
  ON "income_entry"("source","externalId") WHERE "externalId" IS NOT NULL;

-- ── Metrics: the live signals (one row per source/key, overwritten) ───────
CREATE TABLE IF NOT EXISTS "hub_metric" (
  "id"          TEXT PRIMARY KEY,
  "source"      TEXT NOT NULL,                 -- 'stripe' | 'pound' | 'chain' | 'cloudflare'
  "key"         TEXT NOT NULL,                 -- 'pound.tickets_sold', 'chain.SOL.balance', …
  "label"       TEXT NOT NULL,
  "value"       REAL NOT NULL,
  "unit"        TEXT,                          -- 'count' | 'usd' | 'SOL' | 'days' | …
  "ecosystemId" TEXT REFERENCES "ecosystem"("id") ON DELETE SET NULL,
  "detailJson"  TEXT,
  "asOf"        TEXT NOT NULL,
  "updatedAt"   TEXT NOT NULL,
  UNIQUE ("source","key")
);
CREATE INDEX IF NOT EXISTS "idx_hub_metric_eco" ON "hub_metric"("ecosystemId");

-- ── Claims: what the chain says ──────────────────────────────────────────
ALTER TABLE "payment_claim" ADD COLUMN "chainCheckJson" TEXT;
ALTER TABLE "payment_claim" ADD COLUMN "chainCheckedAt" TEXT;
