import { requireSuperAdmin, json, error, nowIso } from "../../../lib/util.js";

// POST {id, action:'read'|'dismiss'} | {action:'read_all'} — Ray's notes to Sol.
export async function onRequestPost({ request, env }) {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;
  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }
  const now = nowIso();
  if (body.action === "read_all") {
    await env.DB.prepare(`UPDATE "ray_note" SET "readAt" = ? WHERE "readAt" IS NULL`).bind(now).run();
    return json({ ok: true });
  }
  const id = String(body.id || "");
  const col = body.action === "dismiss" ? "dismissedAt" : body.action === "read" ? "readAt" : null;
  if (!col) return error(400, "action must be read, dismiss, or read_all");
  const res = await env.DB.prepare(`UPDATE "ray_note" SET "${col}" = COALESCE("${col}", ?) WHERE "id" = ?`)
    .bind(now, id)
    .run();
  if (!res.meta?.changes) return error(404, "Note not found");
  return json({ ok: true });
}
