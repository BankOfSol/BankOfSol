import {
  requireAdmin,
  json,
  error,
  nowIso,
  str,
  logAdminActivity,
} from "../../../lib/util.js";
import { sendCustodyDecision } from "../../../lib/email.js";

// POST /api/admin/custody/decide {id, action, note} — approve/reject an
// application, or suspend/close an approved account. Emails the applicant on
// approve/reject; every decision is logged.
const ACTIONS = {
  approve: { from: ["applied", "suspended"], to: "approved", email: true },
  reject: { from: ["applied"], to: "rejected", email: true },
  suspend: { from: ["approved"], to: "suspended", email: false },
  close: { from: ["approved", "suspended"], to: "closed", email: false },
};

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
  const action = ACTIONS[String(body.action || "")];
  if (!id) return error(400, "id is required");
  if (!action) return error(400, "action must be approve, reject, suspend, or close");

  const row = await env.DB.prepare(
    `SELECT ca.*, u."email", u."name" FROM "custody_account" ca
      JOIN "user" u ON u."id" = ca."userId" WHERE ca."id" = ?`
  )
    .bind(id)
    .first();
  if (!row) return error(404, "Application not found");
  if (!action.from.includes(row.status)) {
    return error(400, `Can't ${body.action} a ${row.status} application`);
  }

  const now = nowIso();
  await env.DB.prepare(
    `UPDATE "custody_account"
        SET "status" = ?, "adminNote" = COALESCE(?, "adminNote"),
            "decidedAt" = ?, "decidedBy" = ?, "updatedAt" = ?
      WHERE "id" = ?`
  )
    .bind(action.to, str(body.note, 500) || null, now, gate.user.email, now, id)
    .run();

  if (action.email) {
    await sendCustodyDecision(env, { email: row.email, name: row.name }, action.to);
  }

  await logAdminActivity(env, gate.user, `custody.${body.action}`, {
    id,
    userEmail: row.email,
  });
  return json({ ok: true, status: action.to });
}
