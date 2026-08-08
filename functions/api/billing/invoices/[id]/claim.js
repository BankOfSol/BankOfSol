import { requireMember, json, error, nowIso, str } from "../../../../lib/util.js";
import { CHAINS } from "../../../../lib/ledger.js";
import { sendClaimNotice } from "../../../../lib/email.js";

// POST /api/billing/invoices/:id/claim {chain, txRef, note} — the crypto
// rail. The member has sent XRP/SOL/BTC/TON to the published receiving
// address and files a claim; Sol verifies on-chain by hand and confirmation
// (Admin → Members) is what writes the ledger entry. One pending claim per
// invoice at a time.
export async function onRequestPost({ request, env, params }) {
  const gate = await requireMember(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const chain = str(body.chain, 8).toUpperCase();
  if (!CHAINS.includes(chain)) return error(400, "chain must be XRP, SOL, BTC, or TON");

  const invoice = await env.DB.prepare(
    `SELECT * FROM "invoice" WHERE "id" = ? AND "userId" = ?`
  )
    .bind(String(params.id || ""), gate.user.id)
    .first();
  if (!invoice) return error(404, "Invoice not found");
  if (!["open", "partial"].includes(invoice.status)) {
    return error(409, `This invoice is ${invoice.status}`);
  }

  const rail = await env.DB.prepare(
    `SELECT 1 FROM "crypto_rail" WHERE "chain" = ? AND "active" = 1`
  )
    .bind(chain)
    .first();
  if (!rail) return error(409, `${chain} payments aren't open right now`);

  const pending = await env.DB.prepare(
    `SELECT 1 FROM "payment_claim" WHERE "invoiceId" = ? AND "status" = 'pending'`
  )
    .bind(invoice.id)
    .first();
  if (pending) {
    return error(409, "A claim on this invoice is already waiting for review");
  }

  const claim = {
    id: crypto.randomUUID(),
    chain,
    txRef: str(body.txRef, 200) || null,
    note: str(body.note, 500) || null,
  };
  await env.DB.prepare(
    `INSERT INTO "payment_claim"
       ("id","invoiceId","userId","chain","txRef","note","status","createdAt")
     VALUES (?,?,?,?,?,?,'pending',?)`
  )
    .bind(claim.id, invoice.id, gate.user.id, claim.chain, claim.txRef, claim.note, nowIso())
    .run();

  await sendClaimNotice(env, claim, invoice, gate.user);
  return json({ ok: true, status: "pending" }, { status: 201 });
}
