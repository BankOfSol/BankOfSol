-- The shop (shop.bankofsol.app): single-shop v1, multi-shop-ready schema
-- (rows keyed by ownerUserId). Merged from PoundPlay's proven 0017+0020+0021
-- with the TON rail stripped — Stripe (USD cents) is the only Phase-1 rail;
-- Solana Pay arrives in Phase 3 as its own system, not as columns here.
--
-- shop_order.status bakes in the FULL lifecycle now, including Phase 2's
-- 'fulfilling' (sent to the print farm) — SQLite CHECK edits are table
-- rebuilds, so the constraint ships complete on day one.

CREATE TABLE IF NOT EXISTS "shop" (
  "id"          TEXT PRIMARY KEY,
  "ownerUserId" TEXT NOT NULL REFERENCES "user"("id"),
  "name"        TEXT NOT NULL,
  "blurb"       TEXT,
  "logoUrl"     TEXT,                          -- /api/files/<key>
  "status"      TEXT NOT NULL DEFAULT 'active'
                  CHECK ("status" IN ('active','hidden','closed')),
  "extra"       TEXT,                          -- JSON escape hatch
  "createdAt"   TEXT NOT NULL,
  "updatedAt"   TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_shop_owner" ON "shop"("ownerUserId");

CREATE TABLE IF NOT EXISTS "product" (
  "id"          TEXT PRIMARY KEY,
  "shopId"      TEXT NOT NULL REFERENCES "shop"("id") ON DELETE CASCADE,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "priceCents"  INTEGER NOT NULL,              -- integer cents, never floats
  "images"      TEXT NOT NULL DEFAULT '[]',    -- JSON array of /api/files/<key>
  "modelUrl"    TEXT,                          -- display model (.3mf/.glb), lazy 3D viewer
  "modelKind"   TEXT CHECK ("modelKind" IN ('3mf','glb') OR "modelKind" IS NULL),
  "colors"      TEXT NOT NULL DEFAULT '[]',    -- JSON [{name, hex}]
  "status"      TEXT NOT NULL DEFAULT 'draft'
                  CHECK ("status" IN ('draft','published','soldout','archived','hidden')),
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "extra"       TEXT,
  "createdAt"   TEXT NOT NULL,
  "updatedAt"   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_product_shop" ON "product"("shopId","status","sortOrder");

-- Guest-capable orders: userId is NULL for guests, who are identified by the
-- buyerEmail/buyerName Stripe snapshotted onto the row when it was paid.
CREATE TABLE IF NOT EXISTS "shop_order" (
  "id"              TEXT PRIMARY KEY,
  "shopId"          TEXT NOT NULL REFERENCES "shop"("id"),
  "productId"       TEXT NOT NULL REFERENCES "product"("id"),
  "userId"          TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "buyerIp"         TEXT,                      -- guest spam cap only
  "buyerEmail"      TEXT,                      -- Stripe snapshot (guest identity)
  "buyerName"       TEXT,
  "refCode"         TEXT NOT NULL UNIQUE,      -- 'BOS-XXXXXX' support reference
  "productName"     TEXT NOT NULL,             -- snapshot; later edits don't rewrite history
  "colorName"       TEXT,
  "qty"             INTEGER NOT NULL CHECK ("qty" BETWEEN 1 AND 20),
  "amountCents"     INTEGER NOT NULL,
  "payMethod"       TEXT NOT NULL DEFAULT 'stripe',
  "stripeSessionId" TEXT,
  "shipping"        TEXT,                      -- JSON {name, address} from Stripe
  "note"            TEXT,
  "status"          TEXT NOT NULL DEFAULT 'pending'
                      CHECK ("status" IN ('pending','paid','fulfilling','fulfilled',
                                          'cancelled','refunded','expired')),
  "createdAt"       TEXT NOT NULL,
  "updatedAt"       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_order_shop" ON "shop_order"("shopId","status","createdAt");
CREATE INDEX IF NOT EXISTS "idx_order_user" ON "shop_order"("userId","createdAt");
CREATE INDEX IF NOT EXISTS "idx_order_session" ON "shop_order"("stripeSessionId");
