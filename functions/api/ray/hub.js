import { json, error, nowIso, str } from "../../lib/util.js";
import { rayTokenOk, hubSummary, NOTE_KINDS, importIncome, upsertMetric } from "../../lib/hub.js";

// Ray's side of the command center (shared token, outbound from Ray only).
//   GET  /api/ray/hub → the same summary Sol sees (ecosystems, goals, stats, last notes)
//   POST /api/ray/hub {model, notes:[{kind,title,body,ecosystemSlug?,goalId?}], goals:[{id, rayNote?, progressPct?}],
//                      income:[{ecosystemSlug, source, externalId, amountCents, occurredOn, note?}],
//                      metrics:[{source, key, label, value, unit?, ecosystemSlug?, detail?, asOf?}]}
// Ray can leave notes, annotate goals, and import what it observed outside
// (Stripe charges, poundplay stats, chain balances, traffic). Imports are
// idempotent — income by (source, externalId), metrics by (source, key). It
// can NOT change statuses, the member ledger, or anything a member sees.
export async function onRequestGet({ request, env }) {
  if (!rayTokenOk(env, request)) return error(401, "Bad token");
  return json(await hubSummary(env, { forRay: true }));
}

export async function onRequestPost({ request, env }) {
  if (!rayTokenOk(env, request)) return error(401, "Bad token");
  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }
  const model = str(body.model, 60) || "ray";
  const now = nowIso();

  const { results } = await env.DB.prepare(`SELECT "id","slug" FROM "ecosystem"`).all();
  const bySlug = Object.fromEntries((results || []).map((e) => [e.slug, e.id]));

  let notesInserted = 0;
  for (const n of (Array.isArray(body.notes) ? body.notes : []).slice(0, 12)) {
    const kind = NOTE_KINDS.includes(n?.kind) ? n.kind : "advice";
    const title = str(n?.title, 120);
    const text = str(n?.body, 2000);
    if (!title || !text) continue;
    const ecosystemId = bySlug[str(n?.ecosystemSlug, 40)] || null;
    const goalId = str(n?.goalId, 60) || null;
    await env.DB.prepare(
      `INSERT INTO "ray_note" ("id","kind","title","body","goalId","ecosystemId","model","createdAt")
       VALUES (?,?,?,?,?,?,?,?)`
    )
      .bind(crypto.randomUUID(), kind, title, text, goalId, ecosystemId, model, now)
      .run();
    notesInserted++;
  }

  let goalsUpdated = 0;
  for (const g of (Array.isArray(body.goals) ? body.goals : []).slice(0, 30)) {
    const id = str(g?.id, 60);
    if (!id) continue;
    const rayNote = str(g?.rayNote, 1000) || null;
    let pct = g?.progressPct === undefined || g?.progressPct === null ? null : Math.trunc(+g.progressPct);
    if (pct !== null && !Number.isFinite(pct)) pct = null;
    if (pct !== null) pct = Math.min(100, Math.max(0, pct));
    const res = await env.DB.prepare(
      `UPDATE "goal" SET "rayNote" = COALESCE(?, "rayNote"), "rayNoteAt" = CASE WHEN ? IS NULL THEN "rayNoteAt" ELSE ? END,
              "progressPct" = COALESCE(?, "progressPct"), "updatedAt" = ?
        WHERE "id" = ? AND "status" = 'active'`
    )
      .bind(rayNote, rayNote, now, pct, now, id)
      .run();
    if (res.meta?.changes) goalsUpdated++;
  }

  const income = { inserted: 0, updated: 0, skipped: 0 };
  for (const row of (Array.isArray(body.income) ? body.income : []).slice(0, 500)) {
    income[await importIncome(env, bySlug, row, `ray:${model}`)]++;
  }
  let metricsUpserted = 0;
  for (const m of (Array.isArray(body.metrics) ? body.metrics : []).slice(0, 200)) {
    if (await upsertMetric(env, bySlug, m)) metricsUpserted++;
  }

  return json({ ok: true, notesInserted, goalsUpdated, income, metricsUpserted });
}
