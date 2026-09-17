import { requireSuperAdmin, json, error, nowIso, logAdminActivity } from "../../../lib/util.js";
import { sanitizeGoal } from "../../../lib/hub.js";

// POST {id?, title, detail?, ecosystemId?, target?, progress?, progressPct?, targetDate?, owner, status}
// DELETE ?id=
export async function onRequestPost({ request, env }) {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;
  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }
  const s = sanitizeGoal(body);
  if (s.error) return error(400, s.error);
  const g = s.goal;
  const now = nowIso();
  const id = String(body.id || "");
  if (g.ecosystemId) {
    const eco = await env.DB.prepare(`SELECT 1 FROM "ecosystem" WHERE "id" = ?`).bind(g.ecosystemId).first();
    if (!eco) return error(404, "Ecosystem not found");
  }
  if (id) {
    const res = await env.DB.prepare(
      `UPDATE "goal" SET "ecosystemId"=?,"title"=?,"detail"=?,"targetCents"=?,"progressCents"=?,"progressPct"=?,
              "targetDate"=?,"owner"=?,"status"=?,"updatedAt"=? WHERE "id"=?`
    )
      .bind(g.ecosystemId, g.title, g.detail, g.targetCents, g.progressCents, g.progressPct, g.targetDate, g.owner, g.status, now, id)
      .run();
    if (!res.meta?.changes) return error(404, "Goal not found");
    await logAdminActivity(env, gate.user, "hub.goal.update", { id, status: g.status });
    return json({ ok: true, id });
  }
  const newId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO "goal" ("id","ecosystemId","title","detail","targetCents","progressCents","progressPct","targetDate","owner","status","createdAt","updatedAt")
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(newId, g.ecosystemId, g.title, g.detail, g.targetCents, g.progressCents, g.progressPct, g.targetDate, g.owner, g.status, now, now)
    .run();
  await logAdminActivity(env, gate.user, "hub.goal.create", { id: newId });
  return json({ ok: true, id: newId }, { status: 201 });
}

export async function onRequestDelete({ request, env }) {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;
  const id = new URL(request.url).searchParams.get("id") || "";
  const res = await env.DB.prepare(`DELETE FROM "goal" WHERE "id" = ?`).bind(id).run();
  if (!res.meta?.changes) return error(404, "Goal not found");
  await logAdminActivity(env, gate.user, "hub.goal.delete", { id });
  return json({ ok: true });
}
