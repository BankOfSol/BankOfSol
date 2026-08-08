import { requireMember, json } from "../../lib/util.js";
import { balanceFor, publicRail } from "../../lib/ledger.js";

// GET /api/billing — the member's whole account in one call: signed balance,
// the itemized ledger, invoices with line items, loans, engagements, active
// payment rails, and completed bookings still awaiting a review. This powers
// the account-management page.
export async function onRequestGet({ request, env }) {
  const gate = await requireMember(env, request);
  if (gate.error) return gate.error;
  const userId = gate.user.id;

  const [balance, entries, invoices, items, loans, engagements, rails, reviewable] =
    await Promise.all([
      balanceFor(env, userId),
      env.DB.prepare(
        `SELECT * FROM "ledger_entry" WHERE "userId" = ?
          ORDER BY "entryDate" DESC LIMIT 300`
      )
        .bind(userId)
        .all(),
      env.DB.prepare(
        `SELECT * FROM "invoice" WHERE "userId" = ? AND "status" != 'draft'
          ORDER BY CASE "status" WHEN 'open' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END,
                   "createdAt" DESC LIMIT 100`
      )
        .bind(userId)
        .all(),
      env.DB.prepare(
        `SELECT ii.* FROM "invoice_item" ii
          JOIN "invoice" i ON i."id" = ii."invoiceId"
         WHERE i."userId" = ? AND i."status" != 'draft'
         ORDER BY ii."sortOrder"`
      )
        .bind(userId)
        .all(),
      env.DB.prepare(
        `SELECT * FROM "loan" WHERE "userId" = ? ORDER BY "createdAt" DESC`
      )
        .bind(userId)
        .all(),
      env.DB.prepare(
        `SELECT "id","name","description","status","startedAt","closedAt","createdAt"
           FROM "engagement" WHERE "userId" = ? ORDER BY "createdAt" DESC`
      )
        .bind(userId)
        .all(),
      env.DB.prepare(`SELECT * FROM "crypto_rail" WHERE "active" = 1 ORDER BY "chain"`).all(),
      env.DB.prepare(
        `SELECT b."id", b."serviceName", b."startAt" FROM "booking" b
          WHERE b."userId" = ? AND b."status" = 'completed'
            AND NOT EXISTS (SELECT 1 FROM "review" r WHERE r."bookingId" = b."id")
          ORDER BY b."startAt" DESC LIMIT 10`
      )
        .bind(userId)
        .all(),
    ]);

  const itemsByInvoice = {};
  for (const it of items.results || []) {
    (itemsByInvoice[it.invoiceId] = itemsByInvoice[it.invoiceId] || []).push(it);
  }

  return json({
    balance,
    entries: entries.results || [],
    invoices: (invoices.results || []).map((inv) => ({
      ...inv,
      items: itemsByInvoice[inv.id] || [],
    })),
    loans: loans.results || [],
    engagements: engagements.results || [],
    rails: (rails.results || []).map(publicRail),
    reviewable: reviewable.results || [],
  });
}
