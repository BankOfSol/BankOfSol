import { requireAdmin, json, error, nowIso, str, logAdminActivity } from "../../lib/util.js";

// Admin → Waitlist. GET ?status=new|invited|closed|all; POST {id, status?, adminNote?}.
// "invited" is a bookkeeping state: Sol emails the person and points them at
// /signup by hand — the site doesn't send invites on its own.
const STATUSES = ["new", "invited", "closed"];

export async function onRequestGet({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;
  const status = new URL(request.url).searchParams.get("status") || "new";
  const where = status === "all" ? "1=1" : `"status" = ?`;
  const binds = status === "all" ? [] : [STATUSES.includes(status) ? status : "new"];
  const { results } = await env.DB.prepare(
    `SELECT "id","email","name","note","source","status","adminNote","createdAt","updatedAt"
       FROM "waitlist" WHERE ${where} ORDER BY "createdAt" DESC LIMIT 500`
  )
    .bind(...binds)
    .all();
  return json({ waitlist: results || [] });
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
  const row = await env.DB.prepare(`SELECT * FROM "waitlist" WHERE "id" = ?`).bind(id).first();
  if (!row) return error(404, "Not found");
  const status = body.status === undefined ? row.status : str(body.status, 12);
  if (!STATUSES.includes(status)) return error(400, "status must be new, invited, or closed");
  const adminNote = body.adminNote === undefined ? row.adminNote : str(body.adminNote, 1000) || null;
  await env.DB.prepare(
    `UPDATE "waitlist" SET "status" = ?, "adminNote" = ?, "updatedAt" = ? WHERE "id" = ?`
  )
    .bind(status, adminNote, nowIso(), id)
    .run();
  await logAdminActivity(env, gate.user, "waitlist.update", { id, status });
  return json({ ok: true });
}
