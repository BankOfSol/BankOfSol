import { requireAdmin, json, error } from "../../../lib/util.js";
import { balanceFor } from "../../../lib/ledger.js";

// GET /api/admin/members/:id — one member's whole file (:id = userId):
// account state, signed balance, itemized ledger, invoices with line items
// (drafts included — this is the admin view), loans, engagements, claims,
// reviews, and recent bookings/orders for context.
export async function onRequestGet({ request, env, params }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;
  const userId = String(params.id || "");

  const account = await env.DB.prepare(
    `SELECT ma.*, u."email", u."name", u."createdAt" AS "userSince"
       FROM "member_account" ma JOIN "user" u ON u."id" = ma."userId"
      WHERE ma."userId" = ?`
  )
    .bind(userId)
    .first();
  if (!account) return error(404, "Member not found");

  const [balance, entries, invoices, items, loans, engagements, claims, reviews, bookings] =
    await Promise.all([
      balanceFor(env, userId),
      env.DB.prepare(
        `SELECT * FROM "ledger_entry" WHERE "userId" = ? ORDER BY "entryDate" DESC LIMIT 300`
      ).bind(userId).all(),
      env.DB.prepare(
        `SELECT * FROM "invoice" WHERE "userId" = ?
          ORDER BY CASE "status" WHEN 'draft' THEN 0 WHEN 'open' THEN 1 WHEN 'partial' THEN 2 ELSE 3 END,
                   "createdAt" DESC LIMIT 100`
      ).bind(userId).all(),
      env.DB.prepare(
        `SELECT ii.* FROM "invoice_item" ii
          JOIN "invoice" i ON i."id" = ii."invoiceId"
         WHERE i."userId" = ? ORDER BY ii."sortOrder"`
      ).bind(userId).all(),
      env.DB.prepare(`SELECT * FROM "loan" WHERE "userId" = ? ORDER BY "createdAt" DESC`)
        .bind(userId).all(),
      env.DB.prepare(`SELECT * FROM "engagement" WHERE "userId" = ? ORDER BY "createdAt" DESC`)
        .bind(userId).all(),
      env.DB.prepare(
        `SELECT pc.*, i."refCode" AS "invoiceRef", i."title" AS "invoiceTitle",
                i."totalCents", i."paidCents"
           FROM "payment_claim" pc JOIN "invoice" i ON i."id" = pc."invoiceId"
          WHERE pc."userId" = ? ORDER BY pc."createdAt" DESC LIMIT 50`
      ).bind(userId).all(),
      env.DB.prepare(
        `SELECT r.*, b."serviceName" FROM "review" r
          LEFT JOIN "booking" b ON b."id" = r."bookingId"
         WHERE r."userId" = ? ORDER BY r."createdAt" DESC LIMIT 50`
      ).bind(userId).all(),
      env.DB.prepare(
        `SELECT "id","serviceName","startAt","status","priceCents" FROM "booking"
          WHERE "userId" = ? ORDER BY "startAt" DESC LIMIT 20`
      ).bind(userId).all(),
    ]);

  const itemsByInvoice = {};
  for (const it of items.results || []) {
    (itemsByInvoice[it.invoiceId] = itemsByInvoice[it.invoiceId] || []).push(it);
  }

  return json({
    account,
    balance,
    entries: entries.results || [],
    invoices: (invoices.results || []).map((inv) => ({
      ...inv,
      items: itemsByInvoice[inv.id] || [],
    })),
    loans: loans.results || [],
    engagements: engagements.results || [],
    claims: claims.results || [],
    reviews: reviews.results || [],
    bookings: bookings.results || [],
  });
}
