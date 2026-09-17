import { requireAdmin, json, error, nowIso, str, logAdminActivity } from "../../../lib/util.js";
import {
  REIMB_STATUSES,
  receiptShape,
  reimbursementShape,
  bookApproval,
  bookPayout,
  stripeTransfer,
} from "../../../lib/reimburse.js";
import { sendReimbursementDecision, sendReimbursementPaid } from "../../../lib/email.js";

// Admin reimbursement desk.
//   GET  ?status=submitted|approved|paid|rejected|all → {reimbursements:[{…, receipts, user}]}
//   POST {id, action:'approve'|'reject', adminNote?}
//   POST {id, action:'paid', paidMethod, paidRef?}        — Sol sent it by hand (crypto,
//                                                            Telegram Wallet, cash, or any rail)
//   POST {id, action:'stripe_transfer'}                   — Transfer to the member's Connect account
// Approval books the −total ledger entry; a payout books the +total. Nothing
// is paid without an explicit admin action — cash included.

export async function onRequestGet({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;
  const status = new URL(request.url).searchParams.get("status") || "submitted";
  const where = status === "all" ? "1=1" : `r."status" = ?`;
  const binds = status === "all" ? [] : [REIMB_STATUSES.includes(status) ? status : "submitted"];

  const { results } = await env.DB.prepare(
    `SELECT r.*, u."email", u."name" FROM "reimbursement" r JOIN "user" u ON u."id" = r."userId"
      WHERE ${where} ORDER BY r."createdAt" DESC LIMIT 200`
  )
    .bind(...binds)
    .all();
  const rows = results || [];
  let receipts = [];
  if (rows.length) {
    const rc = await env.DB.prepare(
      `SELECT * FROM "receipt" WHERE "reimbursementId" IN (${rows.map(() => "?").join(",")}) ORDER BY "createdAt"`
    )
      .bind(...rows.map((r) => r.id))
      .all();
    receipts = (rc.results || []).map(receiptShape);
  }
  const byReq = {};
  for (const r of receipts) (byReq[r.reimbursementId] = byReq[r.reimbursementId] || []).push(r);

  return json({
    reimbursements: rows.map((r) => ({ ...reimbursementShape(r), receipts: byReq[r.id] || [] })),
  });
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
  const reimb = await env.DB.prepare(`SELECT * FROM "reimbursement" WHERE "id" = ?`).bind(id).first();
  if (!reimb) return error(404, "Request not found");
  const member = await env.DB.prepare(`SELECT "id","email","name" FROM "user" WHERE "id" = ?`)
    .bind(reimb.userId)
    .first();
  const now = nowIso();
  const adminNote = str(body.adminNote, 1000) || null;

  if (action === "approve" || action === "reject") {
    if (reimb.status !== "submitted") return error(409, `This request is already ${reimb.status}`);
    const status = action === "approve" ? "approved" : "rejected";
    await env.DB.prepare(
      `UPDATE "reimbursement" SET "status" = ?, "adminNote" = COALESCE(?, "adminNote"),
              "decidedBy" = ?, "decidedAt" = ?, "updatedAt" = ? WHERE "id" = ?`
    )
      .bind(status, adminNote, gate.user.email, now, now, id)
      .run();
    if (status === "approved") await bookApproval(env, reimb, gate.user.email);
    await logAdminActivity(env, gate.user, `reimbursement.${action}`, { id, refCode: reimb.refCode, totalCents: reimb.totalCents });
    if (member?.email) await sendReimbursementDecision(env, member, { ...reimb, adminNote: adminNote || reimb.adminNote }, status);
    return json({ ok: true, status });
  }

  if (action === "paid") {
    if (reimb.status !== "approved") return error(409, "Approve the request before marking it paid");
    const paidMethod = str(body.paidMethod, 20) || reimb.method;
    const paidRef = str(body.paidRef, 200) || null;
    if (paidMethod !== "cash" && !paidRef) {
      return error(400, "Add the transaction reference (hash, transfer id, or a note)");
    }
    await env.DB.prepare(
      `UPDATE "reimbursement" SET "status" = 'paid', "paidBy" = ?, "paidAt" = ?, "paidMethod" = ?,
              "paidRef" = ?, "adminNote" = COALESCE(?, "adminNote"), "updatedAt" = ? WHERE "id" = ?`
    )
      .bind(gate.user.email, now, paidMethod, paidRef, adminNote, now, id)
      .run();
    await bookPayout(env, reimb, { method: paidMethod, reference: paidRef, createdBy: gate.user.email });
    await logAdminActivity(env, gate.user, "reimbursement.paid", { id, refCode: reimb.refCode, paidMethod, totalCents: reimb.totalCents });
    if (member?.email) await sendReimbursementPaid(env, member, { ...reimb, paidMethod, paidRef });
    return json({ ok: true, status: "paid" });
  }

  if (action === "stripe_transfer") {
    if (reimb.status !== "approved") return error(409, "Approve the request before paying it");
    let payout;
    try {
      payout = JSON.parse(reimb.payoutJson || "{}");
    } catch {
      payout = {};
    }
    if (payout.method !== "stripe" || !payout.stripeAccountId) {
      return error(409, "This request wasn't filed for a Stripe payout");
    }
    let transfer;
    try {
      transfer = await stripeTransfer(env, reimb, payout.stripeAccountId);
    } catch (e) {
      return error(503, `Stripe transfer failed: ${e.message}`);
    }
    await env.DB.prepare(
      `UPDATE "reimbursement" SET "status" = 'paid', "paidBy" = ?, "paidAt" = ?, "paidMethod" = 'stripe',
              "paidRef" = ?, "stripeTransferId" = ?, "updatedAt" = ? WHERE "id" = ?`
    )
      .bind(gate.user.email, now, transfer.id, transfer.id, now, id)
      .run();
    await bookPayout(env, reimb, { method: "stripe", reference: transfer.id, createdBy: gate.user.email });
    await logAdminActivity(env, gate.user, "reimbursement.stripe_transfer", { id, refCode: reimb.refCode, transferId: transfer.id, totalCents: reimb.totalCents });
    if (member?.email) await sendReimbursementPaid(env, member, { ...reimb, paidMethod: "stripe", paidRef: transfer.id });
    return json({ ok: true, status: "paid", transferId: transfer.id });
  }

  return error(400, "action must be approve, reject, paid, or stripe_transfer");
}
