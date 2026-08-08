import {
  requireAdmin,
  json,
  error,
  nowIso,
  logAdminActivity,
} from "../../../lib/util.js";
import { sanitizeEngagement } from "../../../lib/ledger.js";

// POST /api/admin/members/engagement — create-or-update (body with "id"
// updates). Engagements are the consulting relationships being delivered —
// the onboarding pipeline Sol manages per member.
export async function onRequestPost({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const { engagement, error: msg } = sanitizeEngagement(body);
  if (msg) return error(400, msg);
  const now = nowIso();

  let id = body.id ? String(body.id) : null;
  if (id) {
    const existing = await env.DB.prepare(`SELECT * FROM "engagement" WHERE "id" = ?`)
      .bind(id)
      .first();
    if (!existing) return error(404, "Engagement not found");
    const startedAt =
      existing.startedAt || (engagement.status === "active" ? now : null);
    const closedAt = ["completed", "closed"].includes(engagement.status)
      ? existing.closedAt || now
      : null;
    await env.DB.prepare(
      `UPDATE "engagement" SET "name"=?, "description"=?, "status"=?, "adminNote"=?,
              "startedAt"=?, "closedAt"=?, "updatedAt"=? WHERE "id"=?`
    )
      .bind(engagement.name, engagement.description, engagement.status,
            engagement.adminNote, startedAt, closedAt, now, id)
      .run();
  } else {
    const userId = String(body.userId || "");
    if (!userId) return error(400, "userId is required");
    const member = await env.DB.prepare(`SELECT 1 FROM "member_account" WHERE "userId" = ?`)
      .bind(userId)
      .first();
    if (!member) return error(404, "Member not found");
    id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO "engagement"
         ("id","userId","name","description","status","adminNote","startedAt","createdAt","updatedAt")
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
      .bind(id, userId, engagement.name, engagement.description, engagement.status,
            engagement.adminNote, engagement.status === "active" ? now : null, now, now)
      .run();
  }

  await logAdminActivity(env, gate.user, "engagement.save", {
    id,
    name: engagement.name,
    status: engagement.status,
  });
  const row = await env.DB.prepare(`SELECT * FROM "engagement" WHERE "id" = ?`).bind(id).first();
  return json({ ok: true, engagement: row });
}
