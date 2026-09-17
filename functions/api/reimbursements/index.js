import { requireMember, json, error, nowIso, str } from "../../lib/util.js";
import {
  MAX_RECEIPTS_PER_REQUEST,
  makeReimbRef,
  payoutSnapshot,
  publicProfile,
  receiptShape,
  reimbursementShape,
} from "../../lib/reimburse.js";
import { sendReimbursementSubmitted } from "../../lib/email.js";

// GET /api/reimbursements — the member's reimbursement desk in one call:
// payout profile, receipts (loose ones first), and every request with its
// receipts attached.
export async function onRequestGet({ request, env }) {
  const gate = await requireMember(env, request);
  if (gate.error) return gate.error;
  const userId = gate.user.id;

  const [profile, receipts, reimbs] = await Promise.all([
    env.DB.prepare(`SELECT * FROM "payout_profile" WHERE "userId" = ?`).bind(userId).first(),
    env.DB.prepare(
      `SELECT * FROM "receipt" WHERE "userId" = ? ORDER BY "createdAt" DESC LIMIT 400`
    )
      .bind(userId)
      .all(),
    env.DB.prepare(
      `SELECT * FROM "reimbursement" WHERE "userId" = ? ORDER BY "createdAt" DESC LIMIT 200`
    )
      .bind(userId)
      .all(),
  ]);

  const all = (receipts.results || []).map(receiptShape);
  const byReq = {};
  for (const r of all) {
    if (r.reimbursementId) (byReq[r.reimbursementId] = byReq[r.reimbursementId] || []).push(r);
  }

  return json({
    profile: publicProfile(profile),
    scanMode: env.RECEIPT_SCAN_MODE === "cloud" ? "cloud" : "ray",
    receipts: all.filter((r) => !r.reimbursementId),
    reimbursements: (reimbs.results || []).map((x) => ({
      ...reimbursementShape(x),
      receipts: byReq[x.id] || [],
    })),
  });
}

// POST /api/reimbursements {title, note?, receiptIds:[…]} — bundle loose
// receipts into a request. The total is the SUM of the receipts' confirmed
// totals (every receipt needs one); the payout method is the profile's,
// snapshotted onto the row.
export async function onRequestPost({ request, env }) {
  const gate = await requireMember(env, request);
  if (gate.error) return gate.error;
  const userId = gate.user.id;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const title = str(body.title, 140);
  if (!title) return error(400, "Give the request a title (what were the supplies for?)");
  const ids = Array.isArray(body.receiptIds)
    ? [...new Set(body.receiptIds.map((x) => str(x, 60)).filter(Boolean))]
    : [];
  if (!ids.length) return error(400, "Pick at least one receipt");
  if (ids.length > MAX_RECEIPTS_PER_REQUEST) {
    return error(400, `Up to ${MAX_RECEIPTS_PER_REQUEST} receipts per request`);
  }

  const profile = await env.DB.prepare(`SELECT * FROM "payout_profile" WHERE "userId" = ?`)
    .bind(userId)
    .first();
  if (!profile) return error(409, "Set how you want to be paid back first");
  if (profile.method === "stripe" && !profile.stripeOnboarded) {
    return error(409, "Finish the Stripe payout setup first, or pick another payout method");
  }

  const { results } = await env.DB.prepare(
    `SELECT * FROM "receipt" WHERE "userId" = ? AND "reimbursementId" IS NULL
        AND "id" IN (${ids.map(() => "?").join(",")})`
  )
    .bind(userId, ...ids)
    .all();
  const receipts = results || [];
  if (receipts.length !== ids.length) {
    return error(409, "One of those receipts is missing or already on a request");
  }
  let totalCents = 0;
  for (const r of receipts) {
    if (!Number.isInteger(r.totalCents) || r.totalCents <= 0) {
      return error(400, `Confirm the total on every receipt first (${r.merchant || "one receipt"} has none)`);
    }
    totalCents += r.totalCents;
  }

  const now = nowIso();
  const reimb = {
    id: crypto.randomUUID(),
    userId,
    refCode: makeReimbRef(),
    title,
    note: str(body.note, 1000) || null,
    totalCents,
    method: profile.method,
    payoutJson: JSON.stringify(payoutSnapshot(profile)),
  };
  await env.DB.prepare(
    `INSERT INTO "reimbursement"
       ("id","userId","refCode","title","note","totalCents","method","payoutJson",
        "status","createdAt","updatedAt")
     VALUES (?,?,?,?,?,?,?,?,'submitted',?,?)`
  )
    .bind(reimb.id, userId, reimb.refCode, reimb.title, reimb.note, totalCents, reimb.method, reimb.payoutJson, now, now)
    .run();
  await env.DB.prepare(
    `UPDATE "receipt" SET "reimbursementId" = ?, "updatedAt" = ?
      WHERE "userId" = ? AND "reimbursementId" IS NULL AND "id" IN (${ids.map(() => "?").join(",")})`
  )
    .bind(reimb.id, now, userId, ...ids)
    .run();

  await sendReimbursementSubmitted(env, reimb, gate.user, receipts.length);
  return json({ ok: true, id: reimb.id, refCode: reimb.refCode, totalCents }, { status: 201 });
}
