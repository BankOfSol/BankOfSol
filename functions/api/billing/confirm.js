import { json, error } from "../../lib/util.js";
import { stripeRequest } from "../../lib/stripe.js";
import { recordInvoicePayment } from "../../lib/ledger.js";

// POST /api/billing/confirm {sessionId} — Stripe fallback for invoice
// payments, same trust model as the shop's: the unguessable cs_… id from the
// member's own return URL is the authorization. Idempotent against the
// webhook: the ledger entry is only written if no payment with this session
// reference exists yet.
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }
  const sessionId = String(body.sessionId || "");
  if (!/^cs_/.test(sessionId)) return error(400, "sessionId is required");

  const session = await stripeRequest(env, "GET", `/checkout/sessions/${sessionId}`);
  if (session?.metadata?.kind !== "bos_invoice") return error(404, "Unknown session");
  if (session.payment_status !== "paid") return json({ paid: false });

  const invoice = await env.DB.prepare(`SELECT * FROM "invoice" WHERE "id" = ?`)
    .bind(String(session.metadata.invoiceId || ""))
    .first();
  if (!invoice) return error(404, "Invoice not found");

  // The webhook races us; the session id is the idempotency key.
  const already = await env.DB.prepare(
    `SELECT 1 FROM "ledger_entry" WHERE "kind" = 'payment' AND "reference" = ?`
  )
    .bind(sessionId)
    .first();
  if (!already) {
    const amountCents = parseInt(session.metadata.amountCents, 10) || session.amount_total;
    await recordInvoicePayment(env, invoice, amountCents, {
      method: "stripe",
      reference: sessionId,
      createdBy: "stripe",
    });
  }

  const fresh = await env.DB.prepare(
    `SELECT "refCode","title","status","totalCents","paidCents" FROM "invoice" WHERE "id" = ?`
  )
    .bind(invoice.id)
    .first();
  return json({ paid: true, invoice: fresh });
}
