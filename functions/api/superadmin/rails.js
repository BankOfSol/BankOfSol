import {
  requireSuperAdmin,
  json,
  error,
  nowIso,
  logAdminActivity,
} from "../../lib/util.js";
import { sanitizeRail } from "../../lib/ledger.js";

// /api/superadmin/rails — the crypto RECEIVING addresses members pay to
// (XRP/SOL/BTC/TON). Superadmin-write-only, same discipline as everything
// address-shaped: PUBLIC addresses only, ever. The sanitizer refuses anything
// that smells like key material.
export async function onRequestGet({ request, env }) {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;
  const { results } = await env.DB.prepare(
    `SELECT * FROM "crypto_rail" ORDER BY "chain", "createdAt"`
  ).all();
  return json({ rails: results || [] });
}

// POST — create-or-update (body with "id" updates).
export async function onRequestPost({ request, env }) {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const { rail, error: msg } = sanitizeRail(body);
  if (msg) return error(400, msg);
  const now = nowIso();

  let id = body.id ? String(body.id) : null;
  if (id) {
    const res = await env.DB.prepare(
      `UPDATE "crypto_rail" SET "chain"=?, "address"=?, "tag"=?, "label"=?, "active"=?, "updatedAt"=?
        WHERE "id"=?`
    )
      .bind(rail.chain, rail.address, rail.tag, rail.label, rail.active, now, id)
      .run();
    if (!res.meta || res.meta.changes === 0) return error(404, "Rail not found");
  } else {
    id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO "crypto_rail" ("id","chain","address","tag","label","active","createdAt","updatedAt")
       VALUES (?,?,?,?,?,?,?,?)`
    )
      .bind(id, rail.chain, rail.address, rail.tag, rail.label, rail.active, now, now)
      .run();
  }

  await logAdminActivity(env, gate.user, "rail.save", { id, chain: rail.chain });
  const row = await env.DB.prepare(`SELECT * FROM "crypto_rail" WHERE "id" = ?`).bind(id).first();
  return json({ ok: true, rail: row });
}

export async function onRequestDelete({ request, env }) {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;
  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "");
  if (!id) return error(400, "id is required");
  const res = await env.DB.prepare(`DELETE FROM "crypto_rail" WHERE "id" = ?`).bind(id).run();
  if (!res.meta || res.meta.changes === 0) return error(404, "Rail not found");
  await logAdminActivity(env, gate.user, "rail.delete", { id });
  return json({ ok: true });
}
