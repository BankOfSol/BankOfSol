import { requireAdmin, json, error, nowIso, str, logAdminActivity } from "../../../lib/util.js";

const STATUSES = ["new", "contacted", "pilot", "closed"];

// GET /api/admin/solray/leads?status= — the Sol & Ray pilot-request queue.
export async function onRequestGet({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  const binds = [];
  let where = "1=1";
  if (STATUSES.includes(status)) {
    where = '"status" = ?';
    binds.push(status);
  }
  const { results } = await env.DB.prepare(
    `SELECT "id","name","title","org","email","phone","volume","message","source","status","adminNote","createdAt","updatedAt"
       FROM "solray_lead" WHERE ${where} ORDER BY "createdAt" DESC LIMIT 200`
  )
    .bind(...binds)
    .all();
  return json({ leads: results || [] });
}

// POST /api/admin/solray/leads {id, status?, adminNote?} — move a lead along.
export async function onRequestPost({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const id = str(body.id, 64);
  if (!id) return error(400, "id required");
  const row = await env.DB.prepare(`SELECT "id","status" FROM "solray_lead" WHERE "id" = ?`)
    .bind(id)
    .first();
  if (!row) return error(404, "Not found");

  const status = STATUSES.includes(body.status) ? body.status : row.status;
  const adminNote = typeof body.adminNote === "string" ? str(body.adminNote, 1000) : undefined;

  await env.DB.prepare(
    `UPDATE "solray_lead" SET "status" = ?, "adminNote" = COALESCE(?, "adminNote"), "updatedAt" = ? WHERE "id" = ?`
  )
    .bind(status, adminNote === undefined ? null : adminNote, nowIso(), id)
    .run();

  await logAdminActivity(env, gate.user, "solray_lead.update", { id, status });
  return json({ ok: true, status });
}
