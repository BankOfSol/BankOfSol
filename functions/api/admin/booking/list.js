import { requireAdmin, json, error } from "../../../lib/util.js";
import { BOOKING_STATUSES } from "../../../lib/booking.js";

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

// GET /api/admin/booking/list?from&to&status — bookings in a window, buyer
// contact included (admin-only surface). Defaults to the last week through
// the next 60 days.
export async function onRequestGet({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const from = isDate(url.searchParams.get("from"))
    ? url.searchParams.get("from")
    : new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to = isDate(url.searchParams.get("to"))
    ? url.searchParams.get("to")
    : new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const status = url.searchParams.get("status") || "all";
  if (status !== "all" && !BOOKING_STATUSES.includes(status)) {
    return error(400, "Invalid status filter");
  }

  const binds = [`${from}T00:00:00Z`, `${to}T23:59:59Z`];
  let where = '"startAt" >= ? AND "startAt" <= ?';
  if (status !== "all") {
    where += ' AND "status" = ?';
    binds.push(status);
  }

  const { results } = await env.DB.prepare(
    `SELECT * FROM "booking" WHERE ${where} ORDER BY "startAt" LIMIT 300`
  )
    .bind(...binds)
    .all();

  return json({ bookings: results || [] });
}
