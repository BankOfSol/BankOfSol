import {
  requireAdmin,
  json,
  error,
  nowIso,
  str,
  logAdminActivity,
} from "../../../lib/util.js";
import { isUsdPrice, usdToCents } from "../../../lib/shop.js";
import { recordInvoicePayment } from "../../../lib/ledger.js";

// GET /api/admin/members/claims — pending crypto payment claims across all
// members (the review queue).
// POST — {id, action:'confirm', amount:"150.00"} | {id, action:'reject', note?}
// Confirming books the payment: Sol has verified the transfer on-chain by
// hand and states its USD value; that writes the ledger entry via the same
// path Stripe uses.
export async function onRequestGet({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  const { results } = await env.DB.prepare(
    `SELECT pc.*, i."refCode" AS "invoiceRef", i."title" AS "invoiceTitle",
            i."totalCents", i."paidCents", u."email", u."name"
       FROM "payment_claim" pc
       JOIN "invoice" i ON i."id" = pc."invoiceId"
       JOIN "user" u ON u."id" = pc."userId"
      WHERE pc."status" = 'pending'
      ORDER BY pc."createdAt" LIMIT 100`
  ).all();

  return json({ claims: results || [] });
}

export async function onRequestPost({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const id = String(body.id || "");
  const action = String(body.action || "");
  if (!id) return error(400, "id is required");
  if (!["confirm", "reject"].includes(action)) {
    return error(400, "action must be confirm or reject");
  }

  const claim = await env.DB.prepare(
    `SELECT * FROM "payment_claim" WHERE "id" = ? AND "status" = 'pending'`
  )
    .bind(id)
    .first();
  if (!claim) return error(404, "Pending claim not found");

  const now = nowIso();

  if (action === "confirm") {
    const amount = str(body.amount, 16);
    if (!isUsdPrice(amount)) {
      return error(400, "State the USD value received, like 150.00");
    }
    const invoice = await env.DB.prepare(`SELECT * FROM "invoice" WHERE "id" = ?`)
      .bind(claim.invoiceId)
      .first();
    if (!invoice || !["open", "partial"].includes(invoice.status)) {
      return error(409, "The invoice isn't payable anymore");
    }
    await recordInvoicePayment(env, invoice, usdToCents(amount), {
      method: claim.chain,
      reference: claim.txRef || `claim ${claim.id}`,
      createdBy: gate.user.email,
    });
  }

  await env.DB.prepare(
    `UPDATE "payment_claim" SET "status" = ?, "decidedBy" = ?, "decidedAt" = ?
      WHERE "id" = ?`
  )
    .bind(action === "confirm" ? "confirmed" : "rejected", gate.user.email, now, id)
    .run();

  await logAdminActivity(env, gate.user, `claim.${action}`, {
    id,
    chain: claim.chain,
    invoiceId: claim.invoiceId,
  });
  return json({ ok: true, status: action === "confirm" ? "confirmed" : "rejected" });
}
