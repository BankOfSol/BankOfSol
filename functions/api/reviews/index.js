import { requireUser, json, error, nowIso, str } from "../../lib/util.js";

// POST /api/reviews {bookingId, rating, body} — post-consulting review. One
// per booking (UNIQUE), only on the caller's own COMPLETED bookings.
// GET /api/reviews — the caller's own reviews.
export async function onRequestPost({ request, env }) {
  const gate = await requireUser(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const bookingId = String(body.bookingId || "");
  const rating = Math.trunc(+body.rating);
  if (!bookingId) return error(400, "bookingId is required");
  if (!(rating >= 1 && rating <= 5)) return error(400, "Rating must be 1–5");

  const booking = await env.DB.prepare(
    `SELECT "id","serviceName" FROM "booking"
      WHERE "id" = ? AND "userId" = ? AND "status" = 'completed'`
  )
    .bind(bookingId, gate.user.id)
    .first();
  if (!booking) return error(404, "Completed booking not found");

  try {
    await env.DB.prepare(
      `INSERT INTO "review" ("id","userId","bookingId","rating","body","createdAt")
       VALUES (?,?,?,?,?,?)`
    )
      .bind(
        crypto.randomUUID(),
        gate.user.id,
        bookingId,
        rating,
        str(body.body, 2000) || null,
        nowIso()
      )
      .run();
  } catch (e) {
    if (/UNIQUE/i.test(e?.message || "")) {
      return error(409, "You've already reviewed this session");
    }
    throw e;
  }

  return json({ ok: true }, { status: 201 });
}

export async function onRequestGet({ request, env }) {
  const gate = await requireUser(env, request);
  if (gate.error) return gate.error;

  const { results } = await env.DB.prepare(
    `SELECT r.*, b."serviceName" FROM "review" r
      LEFT JOIN "booking" b ON b."id" = r."bookingId"
     WHERE r."userId" = ? ORDER BY r."createdAt" DESC LIMIT 50`
  )
    .bind(gate.user.id)
    .all();

  return json({ reviews: results || [] });
}
