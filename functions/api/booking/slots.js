import { json, error } from "../../lib/util.js";
import { computeSlots } from "../../lib/booking.js";

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

// GET /api/booking/slots?serviceId&from&to — open slots as bare UTC instants.
// from/to are LA calendar dates (YYYY-MM-DD), range capped at 31 days. No ids
// leak: the checkout re-derives validity server-side anyway.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const serviceId = String(url.searchParams.get("serviceId") || "");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!serviceId) return error(400, "serviceId is required");
  if (!isDate(from) || !isDate(to) || from > to) {
    return error(400, "from/to must be YYYY-MM-DD with from <= to");
  }
  const spanDays = (Date.parse(`${to}T00:00Z`) - Date.parse(`${from}T00:00Z`)) / 86400000;
  if (spanDays > 31) return error(400, "Range too large (31 days max)");

  const service = await env.DB.prepare(
    `SELECT * FROM "consult_service" WHERE "id" = ? AND "active" = 1`
  )
    .bind(serviceId)
    .first();
  if (!service) return error(404, "Service not found");

  const slots = await computeSlots(env, service, from, to);
  return json({ slots });
}
