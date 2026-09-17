import { requireSuperAdmin, json, error, nowIso, logAdminActivity } from "../../../lib/util.js";
import { sanitizeIncome } from "../../../lib/hub.js";

// POST {ecosystemId, amount:"120.00"|"-40.00", occurredOn?, source?, note?}
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
  const s = sanitizeIncome(body);
  if (s.error) return error(400, s.error);
  const eco = await env.DB.prepare(`SELECT "id" FROM "ecosystem" WHERE "id" = ?`).bind(s.entry.ecosystemId).first();
  if (!eco) return error(404, "Ecosystem not found");
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO "income_entry" ("id","ecosystemId","amountCents","occurredOn","source","note","createdBy","createdAt")
     VALUES (?,?,?,?,?,?,?,?)`
  )
    .bind(id, s.entry.ecosystemId, s.entry.amountCents, s.entry.occurredOn, s.entry.source, s.entry.note, gate.user.email, nowIso())
    .run();
  await logAdminActivity(env, gate.user, "hub.income.add", { id, ecosystemId: s.entry.ecosystemId, amountCents: s.entry.amountCents });
  return json({ ok: true, id }, { status: 201 });
}

export async function onRequestDelete({ request, env }) {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;
  const id = new URL(request.url).searchParams.get("id") || "";
  const res = await env.DB.prepare(`DELETE FROM "income_entry" WHERE "id" = ?`).bind(id).run();
  if (!res.meta?.changes) return error(404, "Entry not found");
  await logAdminActivity(env, gate.user, "hub.income.delete", { id });
  return json({ ok: true });
}
