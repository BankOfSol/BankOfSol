import { json } from "../../lib/util.js";
import { publicService } from "../../lib/booking.js";

// GET /api/booking/services — active services, public shape (no admin
// scheduling knobs beyond what the picker needs).
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM "consult_service" WHERE "active" = 1
      ORDER BY "sortOrder", "createdAt"`
  ).all();
  return json({ services: (results || []).map(publicService) });
}
