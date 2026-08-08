import { requireUser, json } from "../../lib/util.js";

// GET /api/booking/mine — the caller's bookings, soonest upcoming first.
// icsToken rides along so the dashboard can link the calendar file and the
// cancel action (it's the caller's own row).
export async function onRequestGet({ request, env }) {
  const gate = await requireUser(env, request);
  if (gate.error) return gate.error;

  const { results } = await env.DB.prepare(
    `SELECT "id","refCode","icsToken","serviceName","startAt","endAt","buyerTz",
            "priceCents","meetingUrl","status","createdAt"
       FROM "booking"
      WHERE "userId" = ?
      ORDER BY "startAt" DESC LIMIT 100`
  )
    .bind(gate.user.id)
    .all();

  return json({ bookings: results || [] });
}
