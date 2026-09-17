import { requireSuperAdmin, json, error, nowIso, logAdminActivity } from "../../../lib/util.js";
import { sanitizeEcosystem } from "../../../lib/hub.js";

// POST {id?, name, slug?, tagline?, status, color, url?, monthlyTarget, sortOrder?, notes?}
// DELETE ?id=   (409 when it still has income entries — delete those first)
export async function onRequestPost({ request, env }) {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;
  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }
  const s = sanitizeEcosystem(body);
  if (s.error) return error(400, s.error);
  const e = s.eco;
  const now = nowIso();
  const id = String(body.id || "");

  const clash = await env.DB.prepare(`SELECT "id" FROM "ecosystem" WHERE "slug" = ?`).bind(e.slug).first();
  if (clash && clash.id !== id) return error(409, `Slug "${e.slug}" is taken`);

  if (id) {
    const res = await env.DB.prepare(
      `UPDATE "ecosystem" SET "slug"=?,"name"=?,"tagline"=?,"status"=?,"color"=?,"url"=?,
              "monthlyTargetCents"=?,"sortOrder"=?,"notes"=?,"updatedAt"=? WHERE "id"=?`
    )
      .bind(e.slug, e.name, e.tagline, e.status, e.color, e.url, e.monthlyTargetCents, e.sortOrder, e.notes, now, id)
      .run();
    if (!res.meta?.changes) return error(404, "Ecosystem not found");
    await logAdminActivity(env, gate.user, "hub.ecosystem.update", { id, slug: e.slug });
    return json({ ok: true, id });
  }
  const newId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO "ecosystem" ("id","slug","name","tagline","status","color","url","monthlyTargetCents","sortOrder","notes","createdAt","updatedAt")
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(newId, e.slug, e.name, e.tagline, e.status, e.color, e.url, e.monthlyTargetCents, e.sortOrder, e.notes, now, now)
    .run();
  await logAdminActivity(env, gate.user, "hub.ecosystem.create", { id: newId, slug: e.slug });
  return json({ ok: true, id: newId }, { status: 201 });
}

export async function onRequestDelete({ request, env }) {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;
  const id = new URL(request.url).searchParams.get("id") || "";
  const has = await env.DB.prepare(`SELECT 1 FROM "income_entry" WHERE "ecosystemId" = ? LIMIT 1`).bind(id).first();
  if (has) return error(409, "It has income logged — delete those entries first, or set it to closed");
  const res = await env.DB.prepare(`DELETE FROM "ecosystem" WHERE "id" = ?`).bind(id).run();
  if (!res.meta?.changes) return error(404, "Ecosystem not found");
  await logAdminActivity(env, gate.user, "hub.ecosystem.delete", { id });
  return json({ ok: true });
}
