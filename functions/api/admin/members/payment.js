import {
  requireAdmin,
  json,
  error,
  str,
  logAdminActivity,
} from "../../../lib/util.js";
import { isUsdPrice, usdToCents } from "../../../lib/shop.js";
import {
  PAY_METHODS,
  recordInvoicePayment,
  insertEntry,
  balanceFor,
} from "../../../lib/ledger.js";

// POST /api/admin/members/payment — record money by hand:
//   {userId, amount:"150.00", method, reference?, note?, invoiceId?}
//     payment — against an invoice when invoiceId is set, else a bare
//     account credit
//   {userId, amount:"-25.00"|"25.00", kind:"adjustment", note}
//     signed correction (positive = member owes more)
export async function onRequestPost({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const userId = String(body.userId || "");
  if (!userId) return error(400, "userId is required");
  const member = await env.DB.prepare(`SELECT 1 FROM "member_account" WHERE "userId" = ?`)
    .bind(userId)
    .first();
  if (!member) return error(404, "Member not found");

  const kind = str(body.kind, 20) || "payment";

  if (kind === "adjustment") {
    const raw = str(body.amount, 17);
    const negative = raw.startsWith("-");
    const mag = negative ? raw.slice(1) : raw;
    if (!isUsdPrice(mag)) return error(400, "Amount must look like 25.00 (optionally -25.00)");
    const note = str(body.note, 500);
    if (!note) return error(400, "Adjustments need a note — the ledger explains itself");
    const amountCents = (negative ? -1 : 1) * usdToCents(mag);
    await insertEntry(env, {
      userId,
      kind: "adjustment",
      amountCents,
      note,
      createdBy: gate.user.email,
    });
    await logAdminActivity(env, gate.user, "ledger.adjustment", { userId, amountCents });
    return json({ ok: true, balance: await balanceFor(env, userId) });
  }

  if (kind !== "payment") return error(400, "kind must be payment or adjustment");

  const amount = str(body.amount, 16);
  if (!isUsdPrice(amount)) return error(400, "Amount must be a dollar amount like 150.00");
  const amountCents = usdToCents(amount);
  const method = str(body.method, 12) || "other";
  if (!PAY_METHODS.includes(method)) {
    return error(400, `method must be one of ${PAY_METHODS.join(", ")}`);
  }
  const reference = str(body.reference, 200) || null;

  if (body.invoiceId) {
    const invoice = await env.DB.prepare(
      `SELECT * FROM "invoice" WHERE "id" = ? AND "userId" = ?`
    )
      .bind(String(body.invoiceId), userId)
      .first();
    if (!invoice) return error(404, "Invoice not found");
    if (!["open", "partial"].includes(invoice.status)) {
      return error(409, `This invoice is ${invoice.status}`);
    }
    const res = await recordInvoicePayment(env, invoice, amountCents, {
      method,
      reference,
      createdBy: gate.user.email,
      note: str(body.note, 500) || undefined,
    });
    await logAdminActivity(env, gate.user, "payment.record", {
      userId,
      invoiceId: invoice.id,
      amountCents,
      method,
    });
    return json({ ok: true, invoiceStatus: res.status, balance: await balanceFor(env, userId) });
  }

  await insertEntry(env, {
    userId,
    kind: "payment",
    amountCents: -amountCents,
    method,
    reference,
    note: str(body.note, 500) || "Payment on account",
    createdBy: gate.user.email,
  });
  await logAdminActivity(env, gate.user, "payment.record", { userId, amountCents, method });
  return json({ ok: true, balance: await balanceFor(env, userId) });
}
