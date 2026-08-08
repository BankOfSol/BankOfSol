import {
  requireAdmin,
  json,
  error,
  nowIso,
  logAdminActivity,
} from "../../../lib/util.js";
import { sanitizeRule, sanitizeException } from "../../../lib/booking.js";

// GET /api/admin/booking/availability — weekly rules + date exceptions
// (exceptions from the last 30 days onward; ancient history isn't useful in
// the editor).
export async function onRequestGet({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [rules, exceptions] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM "availability_rule" ORDER BY "weekday", "startTime"`
    ).all(),
    env.DB.prepare(
      `SELECT * FROM "availability_exception" WHERE "date" >= ? ORDER BY "date"`
    )
      .bind(since)
      .all(),
  ]);

  return json({
    rules: rules.results || [],
    exceptions: exceptions.results || [],
  });
}

// POST {kind: 'rule'|'exception', ...fields, id?} — create-or-update for
// rules; create-only for exceptions (they're single-purpose rows — delete and
// remake to change one).
export async function onRequestPost({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const now = nowIso();
  const kind = String(body.kind || "");

  if (kind === "rule") {
    const { rule, error: msg } = sanitizeRule(body);
    if (msg) return error(400, msg);
    let id = body.id ? String(body.id) : null;
    if (id) {
      const res = await env.DB.prepare(
        `UPDATE "availability_rule"
            SET "weekday"=?, "startTime"=?, "endTime"=?, "active"=?, "updatedAt"=?
          WHERE "id"=?`
      )
        .bind(rule.weekday, rule.startTime, rule.endTime, rule.active, now, id)
        .run();
      if (!res.meta || res.meta.changes === 0) return error(404, "Rule not found");
    } else {
      id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO "availability_rule"
           ("id","weekday","startTime","endTime","active","createdAt","updatedAt")
         VALUES (?,?,?,?,?,?,?)`
      )
        .bind(id, rule.weekday, rule.startTime, rule.endTime, rule.active, now, now)
        .run();
    }
    await logAdminActivity(env, gate.user, "booking.availability.rule", { id, ...rule });
    const row = await env.DB.prepare(`SELECT * FROM "availability_rule" WHERE "id" = ?`)
      .bind(id)
      .first();
    return json({ ok: true, rule: row });
  }

  if (kind === "exception") {
    const { exception, error: msg } = sanitizeException(body);
    if (msg) return error(400, msg);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO "availability_exception"
         ("id","date","kind","startTime","endTime","note","createdAt")
       VALUES (?,?,?,?,?,?,?)`
    )
      .bind(id, exception.date, exception.kind, exception.startTime, exception.endTime, exception.note, now)
      .run();
    await logAdminActivity(env, gate.user, "booking.availability.exception", {
      id,
      ...exception,
    });
    const row = await env.DB.prepare(
      `SELECT * FROM "availability_exception" WHERE "id" = ?`
    )
      .bind(id)
      .first();
    return json({ ok: true, exception: row });
  }

  return error(400, "kind must be rule or exception");
}

// DELETE ?kind=rule|exception&id=
export async function onRequestDelete({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const id = String(url.searchParams.get("id") || "");
  if (!id) return error(400, "id is required");

  const table =
    kind === "rule"
      ? "availability_rule"
      : kind === "exception"
        ? "availability_exception"
        : null;
  if (!table) return error(400, "kind must be rule or exception");

  const res = await env.DB.prepare(`DELETE FROM "${table}" WHERE "id" = ?`)
    .bind(id)
    .run();
  if (!res.meta || res.meta.changes === 0) return error(404, "Not found");

  await logAdminActivity(env, gate.user, `booking.availability.delete`, { kind, id });
  return json({ ok: true });
}
