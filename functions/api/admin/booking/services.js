import {
  requireAdmin,
  json,
  error,
  nowIso,
  logAdminActivity,
} from "../../../lib/util.js";
import { sanitizeService } from "../../../lib/booking.js";

// GET /api/admin/booking/services — every service, active or not.
export async function onRequestGet({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  const { results } = await env.DB.prepare(
    `SELECT * FROM "consult_service" ORDER BY "sortOrder", "createdAt"`
  ).all();
  return json({ services: results || [] });
}

// POST — create-or-update (body with "id" updates). Full payload both ways;
// sanitizeService validates everything.
export async function onRequestPost({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const { service, error: msg } = sanitizeService(body);
  if (msg) return error(400, msg);

  const now = nowIso();
  let id = body.id ? String(body.id) : null;

  try {
    if (id) {
      const res = await env.DB.prepare(
        `UPDATE "consult_service"
            SET "slug"=?, "name"=?, "description"=?, "durationMin"=?, "priceCents"=?,
                "slotEveryMin"=?, "bufferMin"=?, "leadHours"=?, "maxDaysAhead"=?,
                "active"=?, "sortOrder"=?, "updatedAt"=?
          WHERE "id"=?`
      )
        .bind(
          service.slug,
          service.name,
          service.description,
          service.durationMin,
          service.priceCents,
          service.slotEveryMin,
          service.bufferMin,
          service.leadHours,
          service.maxDaysAhead,
          service.active,
          service.sortOrder,
          now,
          id
        )
        .run();
      if (!res.meta || res.meta.changes === 0) return error(404, "Service not found");
      await logAdminActivity(env, gate.user, "booking.service.update", {
        id,
        name: service.name,
      });
    } else {
      id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO "consult_service"
           ("id","slug","name","description","durationMin","priceCents","slotEveryMin",
            "bufferMin","leadHours","maxDaysAhead","active","sortOrder","createdAt","updatedAt")
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
        .bind(
          id,
          service.slug,
          service.name,
          service.description,
          service.durationMin,
          service.priceCents,
          service.slotEveryMin,
          service.bufferMin,
          service.leadHours,
          service.maxDaysAhead,
          service.active,
          service.sortOrder,
          now,
          now
        )
        .run();
      await logAdminActivity(env, gate.user, "booking.service.create", {
        id,
        name: service.name,
      });
    }
  } catch (e) {
    if (/UNIQUE/i.test(e?.message || "")) {
      return error(409, "That slug is taken — pick another");
    }
    throw e;
  }

  const row = await env.DB.prepare(`SELECT * FROM "consult_service" WHERE "id" = ?`)
    .bind(id)
    .first();
  return json({ ok: true, service: row });
}

// DELETE ?id= — hard delete only while no bookings reference it; with
// history, deactivate instead so refCodes stay resolvable.
export async function onRequestDelete({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "");
  if (!id) return error(400, "id is required");

  const used = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM "booking" WHERE "serviceId" = ?`
  )
    .bind(id)
    .first();
  if ((used?.n ?? 0) > 0) {
    return error(409, "This service has bookings — deactivate it instead of deleting");
  }

  const res = await env.DB.prepare(`DELETE FROM "consult_service" WHERE "id" = ?`)
    .bind(id)
    .run();
  if (!res.meta || res.meta.changes === 0) return error(404, "Service not found");

  await logAdminActivity(env, gate.user, "booking.service.delete", { id });
  return json({ ok: true });
}
