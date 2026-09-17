import { json, error, nowIso } from "../../lib/util.js";
import { SCAN_PROMPT, parseScan, applyScan } from "../../lib/reimburse.js";
import { rayTokenOk as tokenOk } from "../../lib/hub.js";

// The scan queue for Ray (Sol's local agent, AGENTS/Ray). Ray makes OUTBOUND
// calls only — it polls here, downloads the photo from /api/files/<key>,
// reads it with its local Qwen vision model, and posts the result back. No
// session: the shared secret RAY_SHARED_TOKEN (wrangler secret) in
// X-Ray-Token is the auth, compared in constant time.
//
//   GET  /api/ray/receipts?limit=3   → {prompt, receipts:[{id, fileUrl}]}  (leases them: status→scanning)
//   POST /api/ray/receipts {id, model, output} | {id, model, error}         → {ok}
//
// A lease older than 10 minutes is handed out again, so a crashed scan
// can't strand a receipt.

const LEASE_MS = 10 * 60 * 1000;

export async function onRequestGet({ request, env }) {
  if (!tokenOk(env, request)) return error(401, "Bad token");
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "3", 10) || 3, 1), 10);
  const staleBefore = new Date(Date.now() - LEASE_MS).toISOString();

  const { results } = await env.DB.prepare(
    `SELECT "id","fileUrl","contentType" FROM "receipt"
      WHERE "status" = 'queued' OR ("status" = 'scanning' AND "scanStartedAt" < ?)
      ORDER BY "createdAt" LIMIT ?`
  )
    .bind(staleBefore, limit)
    .all();
  const rows = results || [];
  if (rows.length) {
    const now = nowIso();
    await env.DB.prepare(
      `UPDATE "receipt" SET "status" = 'scanning', "scanStartedAt" = ?, "updatedAt" = ?
        WHERE "id" IN (${rows.map(() => "?").join(",")})`
    )
      .bind(now, now, ...rows.map((r) => r.id))
      .run();
  }
  return json({ prompt: SCAN_PROMPT, receipts: rows });
}

export async function onRequestPost({ request, env }) {
  if (!tokenOk(env, request)) return error(401, "Bad token");
  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }
  const id = String(body.id || "");
  const row = await env.DB.prepare(`SELECT * FROM "receipt" WHERE "id" = ?`).bind(id).first();
  if (!row) return error(404, "Receipt not found");
  if (row.status !== "scanning") return error(409, `Receipt is ${row.status}, not leased`);

  const model = `ray:${String(body.model || "qwen-vl").slice(0, 60)}`;
  const result = body.error
    ? { ok: false, error: String(body.error).slice(0, 300) }
    : parseScan(body.output);
  await applyScan(env, row, result, model);
  return json({ ok: true, status: result.ok ? "scanned" : "failed" });
}
