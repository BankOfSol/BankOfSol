import { bookingIcs } from "../../../lib/booking.js";

// GET /api/booking/ics/:token — the calendar file. The token is unguessable
// (UUID, emailed to the buyer); paid/completed bookings only, everything else
// 404s. text/calendar so calendar apps import it directly.
export async function onRequestGet({ params, env }) {
  const token = String(params.token || "");
  const booking = await env.DB.prepare(
    `SELECT * FROM "booking" WHERE "icsToken" = ? AND "status" IN ('paid','completed')`
  )
    .bind(token)
    .first();
  if (!booking) return new Response("Not found", { status: 404 });

  return new Response(bookingIcs(booking), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="bankofsol-${booking.refCode}.ics"`,
      "cache-control": "no-store",
    },
  });
}
