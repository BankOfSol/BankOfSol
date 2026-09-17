-- Reimbursements: a member (first: Azzy, POUND lead) photographs receipts,
-- the site queues them for AI image-to-text (Ray's local Qwen vision model
-- polls the queue; Workers AI is the cloud fallback), the member bundles
-- receipts into a reimbursement request and picks how to be paid back, and
-- Sol/an admin approves it and pays it out. Approval books a negative
-- 'reimbursement' ledger entry (Sol owes the member); the payout books the
-- matching positive 'payout' entry. Cash payouts require the same manual
-- approval as everything else — nothing here moves money on its own.

-- ── How each member wants to be paid back ──────────────────────────────────
-- One row per member. Crypto/Telegram fields are the MEMBER's receiving
-- addresses (public, no keys — the no-keys invariant holds on both sides).
-- Stripe payouts use Stripe Connect Express: only the acct_ id is stored.
CREATE TABLE IF NOT EXISTS "payout_profile" (
  "userId"            TEXT PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "method"            TEXT NOT NULL DEFAULT 'cash'
                        CHECK ("method" IN ('stripe','crypto','telegram','cash')),
  "cryptoChain"       TEXT CHECK ("cryptoChain" IS NULL OR "cryptoChain" IN ('XRP','SOL','BTC','TON')),
  "cryptoAddress"     TEXT,
  "cryptoTag"         TEXT,                     -- XRP destination tag / TON memo
  "telegramHandle"    TEXT,                     -- @username (Wallet in Telegram)
  "telegramTonAddress" TEXT,                    -- the TON address Wallet shows
  "stripeAccountId"   TEXT,                     -- acct_… (Connect Express)
  "stripeOnboarded"   INTEGER NOT NULL DEFAULT 0,
  "cashNote"          TEXT,                     -- "hand it to me at the party"
  "createdAt"         TEXT NOT NULL,
  "updatedAt"         TEXT NOT NULL
);

-- ── Reimbursement requests ─────────────────────────────────────────────────
-- submitted → approved (ledger: −total) → paid (ledger: +total) | rejected.
-- payoutJson snapshots the payout details at submit time so a later profile
-- edit can't rewrite where an approved payout was supposed to go.
CREATE TABLE IF NOT EXISTS "reimbursement" (
  "id"               TEXT PRIMARY KEY,
  "userId"           TEXT NOT NULL REFERENCES "user"("id"),
  "refCode"          TEXT NOT NULL UNIQUE,      -- 'RMB-XXXXXX'
  "title"            TEXT NOT NULL,
  "note"             TEXT,
  "totalCents"       INTEGER NOT NULL,
  "method"           TEXT NOT NULL CHECK ("method" IN ('stripe','crypto','telegram','cash')),
  "payoutJson"       TEXT NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'submitted'
                       CHECK ("status" IN ('submitted','approved','paid','rejected')),
  "adminNote"        TEXT,
  "decidedBy"        TEXT,
  "decidedAt"        TEXT,
  "paidBy"           TEXT,
  "paidAt"           TEXT,
  "paidMethod"       TEXT,                      -- what was actually used
  "paidRef"          TEXT,                      -- tx hash / Stripe transfer id / "cash, 9/20"
  "stripeTransferId" TEXT,
  "createdAt"        TEXT NOT NULL,
  "updatedAt"        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_reimbursement_user" ON "reimbursement"("userId","status");
CREATE INDEX IF NOT EXISTS "idx_reimbursement_status" ON "reimbursement"("status","createdAt");

-- ── Receipts ───────────────────────────────────────────────────────────────
-- One photo each, stored in R2 (fileUrl = /api/files/<key>). The scan
-- lifecycle: queued → scanning (leased to a scanner) → scanned | failed.
-- scanJson is the model's structured read; merchant/purchaseDate/totalCents
-- start as the scan's values and stay editable by the member (the human is
-- the source of truth; the model is a typist).
CREATE TABLE IF NOT EXISTS "receipt" (
  "id"              TEXT PRIMARY KEY,
  "userId"          TEXT NOT NULL REFERENCES "user"("id"),
  "reimbursementId" TEXT REFERENCES "reimbursement"("id") ON DELETE SET NULL,
  "fileUrl"         TEXT NOT NULL,
  "contentType"     TEXT,
  "status"          TEXT NOT NULL DEFAULT 'queued'
                      CHECK ("status" IN ('queued','scanning','scanned','failed')),
  "scanJson"        TEXT,
  "scanModel"       TEXT,                       -- 'ray:qwen3-vl:8b' | 'workers-ai:…'
  "scanError"       TEXT,
  "scanStartedAt"   TEXT,
  "scannedAt"       TEXT,
  "merchant"        TEXT,
  "purchaseDate"    TEXT,                       -- 'YYYY-MM-DD'
  "totalCents"      INTEGER,
  "note"            TEXT,
  "createdAt"       TEXT NOT NULL,
  "updatedAt"       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_receipt_user" ON "receipt"("userId","createdAt");
CREATE INDEX IF NOT EXISTS "idx_receipt_status" ON "receipt"("status","createdAt");
CREATE INDEX IF NOT EXISTS "idx_receipt_reimbursement" ON "receipt"("reimbursementId");

-- ── Ledger: two new kinds ──────────────────────────────────────────────────
-- SQLite can't ALTER a CHECK, so the table is rebuilt (nothing references
-- ledger_entry, so this is copy → drop → rename → re-index).
--   reimbursement : negative — an approved request; Sol owes the member
--   payout        : positive — Sol paid it out (method/reference say how)
CREATE TABLE "ledger_entry_new" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL REFERENCES "user"("id"),
  "kind"       TEXT NOT NULL CHECK ("kind" IN
                 ('invoice','payment','loan_disbursement','loan_due',
                  'loan_payment','adjustment','refund','reimbursement','payout')),
  "amountCents" INTEGER NOT NULL,
  "method"     TEXT,
  "reference"  TEXT,
  "invoiceId"  TEXT REFERENCES "invoice"("id") ON DELETE SET NULL,
  "loanId"     TEXT,
  "note"       TEXT,
  "createdBy"  TEXT NOT NULL,
  "entryDate"  TEXT NOT NULL,
  "createdAt"  TEXT NOT NULL
);
INSERT INTO "ledger_entry_new" SELECT "id","userId","kind","amountCents","method","reference","invoiceId","loanId","note","createdBy","entryDate","createdAt" FROM "ledger_entry";
DROP TABLE "ledger_entry";
ALTER TABLE "ledger_entry_new" RENAME TO "ledger_entry";
CREATE INDEX IF NOT EXISTS "idx_ledger_user" ON "ledger_entry"("userId","entryDate");
CREATE INDEX IF NOT EXISTS "idx_ledger_loan" ON "ledger_entry"("loanId");
