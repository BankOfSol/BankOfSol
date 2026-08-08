-- The pivot: Bank of Sol is a member platform for hiring Sol. The public site
-- recruits members; the money machinery lives behind the login. This migration
-- renames the custody waitlist into the MEMBERSHIP application it always
-- behaved as, and adds the banking core: a per-member ledger, invoices with
-- line items, crypto payment rails (receiving addresses only — the no-keys
-- invariant holds), loans with monthly tracking, engagements (the consulting
-- relationships being delivered), and post-consulting reviews.

-- ── Membership (was custody_account — same lifecycle, honest name) ─────────
ALTER TABLE "custody_account" RENAME TO "member_account";

-- ── Crypto payment rails ───────────────────────────────────────────────────
-- RECEIVING addresses for member payments, one row per chain (XRP/SOL/BTC/TON).
-- PUBLIC addresses only, superadmin-write-only. `tag` carries the XRP
-- destination tag / TON memo where the chain needs one.
CREATE TABLE IF NOT EXISTS "crypto_rail" (
  "id"        TEXT PRIMARY KEY,
  "chain"     TEXT NOT NULL CHECK ("chain" IN ('XRP','SOL','BTC','TON')),
  "address"   TEXT NOT NULL,
  "tag"       TEXT,
  "label"     TEXT,
  "active"    INTEGER NOT NULL DEFAULT 1,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

-- ── Engagements: the consulting relationships ──────────────────────────────
CREATE TABLE IF NOT EXISTS "engagement" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "status"      TEXT NOT NULL DEFAULT 'onboarding'
                  CHECK ("status" IN ('onboarding','active','paused','completed','closed')),
  "adminNote"   TEXT,
  "startedAt"   TEXT,
  "closedAt"    TEXT,
  "createdAt"   TEXT NOT NULL,
  "updatedAt"   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_engagement_user" ON "engagement"("userId","status");

-- ── Invoices ───────────────────────────────────────────────────────────────
-- draft → open (posts the ledger charge, emails the member) → partial/paid as
-- payments land. void reverses an open invoice with a compensating entry.
CREATE TABLE IF NOT EXISTS "invoice" (
  "id"           TEXT PRIMARY KEY,
  "userId"       TEXT NOT NULL REFERENCES "user"("id"),
  "engagementId" TEXT REFERENCES "engagement"("id") ON DELETE SET NULL,
  "refCode"      TEXT NOT NULL UNIQUE,          -- 'INV-XXXXXX'
  "title"        TEXT NOT NULL,
  "notes"        TEXT,
  "status"       TEXT NOT NULL DEFAULT 'draft'
                   CHECK ("status" IN ('draft','open','partial','paid','void')),
  "totalCents"   INTEGER NOT NULL DEFAULT 0,
  "paidCents"    INTEGER NOT NULL DEFAULT 0,
  "dueDate"      TEXT,                          -- 'YYYY-MM-DD'
  "openedAt"     TEXT,
  "paidAt"       TEXT,
  "createdAt"    TEXT NOT NULL,
  "updatedAt"    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_invoice_user" ON "invoice"("userId","status");

CREATE TABLE IF NOT EXISTS "invoice_item" (
  "id"          TEXT PRIMARY KEY,
  "invoiceId"   TEXT NOT NULL REFERENCES "invoice"("id") ON DELETE CASCADE,
  "description" TEXT NOT NULL,
  "qty"         INTEGER NOT NULL DEFAULT 1 CHECK ("qty" BETWEEN 1 AND 9999),
  "unitCents"   INTEGER NOT NULL,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "idx_invoice_item" ON "invoice_item"("invoiceId","sortOrder");

-- ── The ledger: every money event, bank-style ──────────────────────────────
-- amountCents is SIGNED: positive = the member owes Sol more (an invoice
-- opened, a loan disbursed); negative = credit (a payment received, a refund
-- issued). A member's balance is SUM(amountCents); > 0 means they owe.
-- kind 'loan_due' rows are amount-0 markers — the monthly schedule made
-- visible in the itemized list without double-counting the disbursed
-- principal.
CREATE TABLE IF NOT EXISTS "ledger_entry" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL REFERENCES "user"("id"),
  "kind"       TEXT NOT NULL CHECK ("kind" IN
                 ('invoice','payment','loan_disbursement','loan_due',
                  'loan_payment','adjustment','refund')),
  "amountCents" INTEGER NOT NULL,
  "method"     TEXT,                            -- 'stripe' | 'XRP' | 'SOL' | 'BTC' | 'TON' | 'other'
  "reference"  TEXT,                            -- tx hash / stripe id / check no.
  "invoiceId"  TEXT REFERENCES "invoice"("id") ON DELETE SET NULL,
  "loanId"     TEXT,                            -- REFERENCES loan (declared below)
  "note"       TEXT,
  "createdBy"  TEXT NOT NULL,                   -- admin email | 'stripe' | 'system'
  "entryDate"  TEXT NOT NULL,                   -- ISO instant the event is booked at
  "createdAt"  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_ledger_user" ON "ledger_entry"("userId","entryDate");
CREATE INDEX IF NOT EXISTS "idx_ledger_loan" ON "ledger_entry"("loanId");

-- ── Loans ──────────────────────────────────────────────────────────────────
-- Disbursement posts +principal to the ledger; payments post negative
-- loan_payment entries. The daily cron drops an amount-0 'loan_due' marker
-- (and emails both sides) on dueDay each month while the loan is active.
CREATE TABLE IF NOT EXISTS "loan" (
  "id"              TEXT PRIMARY KEY,
  "userId"          TEXT NOT NULL REFERENCES "user"("id"),
  "refCode"         TEXT NOT NULL UNIQUE,       -- 'LOAN-XXXXXX'
  "principalCents"  INTEGER NOT NULL,
  "monthlyDueCents" INTEGER,                    -- NULL = no fixed schedule
  "dueDay"          INTEGER NOT NULL DEFAULT 1 CHECK ("dueDay" BETWEEN 1 AND 28),
  "status"          TEXT NOT NULL DEFAULT 'active'
                      CHECK ("status" IN ('active','paid','defaulted','forgiven','closed')),
  "startDate"       TEXT NOT NULL,              -- 'YYYY-MM-DD'
  "note"            TEXT,
  "createdAt"       TEXT NOT NULL,
  "updatedAt"       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_loan_user" ON "loan"("userId","status");

-- ── Crypto payment claims ──────────────────────────────────────────────────
-- A member says "I sent it" for an invoice; Sol confirms against the chain by
-- hand, and confirmation is what writes the ledger entry. Claims are intents,
-- the ledger is facts.
CREATE TABLE IF NOT EXISTS "payment_claim" (
  "id"         TEXT PRIMARY KEY,
  "invoiceId"  TEXT NOT NULL REFERENCES "invoice"("id"),
  "userId"     TEXT NOT NULL REFERENCES "user"("id"),
  "chain"      TEXT NOT NULL CHECK ("chain" IN ('XRP','SOL','BTC','TON')),
  "txRef"      TEXT,                            -- tx hash / explorer link, member-supplied
  "note"       TEXT,
  "status"     TEXT NOT NULL DEFAULT 'pending'
                 CHECK ("status" IN ('pending','confirmed','rejected')),
  "decidedBy"  TEXT,
  "decidedAt"  TEXT,
  "createdAt"  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_claim_status" ON "payment_claim"("status","createdAt");

-- ── Post-consulting reviews ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "review" (
  "id"           TEXT PRIMARY KEY,
  "userId"       TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "bookingId"    TEXT UNIQUE REFERENCES "booking"("id") ON DELETE SET NULL,
  "engagementId" TEXT REFERENCES "engagement"("id") ON DELETE SET NULL,
  "rating"       INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "body"         TEXT,
  "createdAt"    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_review_user" ON "review"("userId");
