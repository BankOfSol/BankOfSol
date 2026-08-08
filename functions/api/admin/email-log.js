import { requireAdmin, json } from "../../lib/util.js";

// GET /api/admin/email-log?kind= — the outbound mail ledger. Subjects and
// outcomes only (that's all the table stores — never bodies or links).
export async function onRequestGet({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");

  const binds = [];
  let where = "1=1";
  if (kind) {
    where = '"kind" = ?';
    binds.push(String(kind).slice(0, 40));
  }

  const { results } = await env.DB.prepare(
    `SELECT * FROM "email_log" WHERE ${where} ORDER BY "createdAt" DESC LIMIT 150`
  )
    .bind(...binds)
    .all();

  return json({ log: results || [] });
}
