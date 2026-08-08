// Daily cron work for the bankofsol-mailer Worker: admin digest, booking
// reminders, and stale-pending hygiene. Runs at 0 16 * * * UTC (8am PT).
//
// Every section guards its own queries — a table that doesn't exist yet (a
// migration not applied) must not kill the whole cron.
import {
  sendAdminNotice,
  sendBookingReminder,
} from "./email.js";

const dayAgo = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();

async function rows(env, sql, ...binds) {
  try {
    const res = await env.DB.prepare(sql).bind(...binds).all();
    return res?.results || [];
  } catch (e) {
    console.error(`[digest] query failed: ${e?.message || e}`);
    return [];
  }
}

// ── Daily digest to Sol ─────────────────────────────────────────────────────
// New paid orders, paid bookings, and custody applications from the last 24h.
// Silent when there's nothing — an empty digest trains the reader to ignore it.
async function sendDailyDigest(env) {
  const since = dayAgo();
  const orders = await rows(
    env,
    `SELECT "refCode","productName","qty","amountCents" FROM "shop_order"
      WHERE "status" IN ('paid','fulfilling','fulfilled') AND "updatedAt" > ? ORDER BY "updatedAt" DESC`,
    since
  );
  const bookings = await rows(
    env,
    `SELECT "refCode","serviceName","startAt","buyerName" FROM "booking"
      WHERE "status" = 'paid' AND "updatedAt" > ? ORDER BY "startAt"`,
    since
  );
  const applications = await rows(
    env,
    `SELECT ca."appliedAt", u."email" FROM "custody_account" ca
      JOIN "user" u ON u."id" = ca."userId"
      WHERE ca."status" = 'applied' AND ca."appliedAt" > ?`,
    since
  );

  if (!orders.length && !bookings.length && !applications.length) return;

  const lines = [];
  if (orders.length) {
    lines.push(`Orders (${orders.length}):`);
    for (const o of orders)
      lines.push(`  ${o.refCode} — ${o.productName} ×${o.qty} · $${(o.amountCents / 100).toFixed(2)}`);
  }
  if (bookings.length) {
    lines.push(`Bookings (${bookings.length}):`);
    for (const b of bookings)
      lines.push(`  ${b.refCode} — ${b.serviceName} · ${b.startAt} · ${b.buyerName || "guest"}`);
  }
  if (applications.length) {
    lines.push(`Custody applications (${applications.length}):`);
    for (const a of applications) lines.push(`  ${a.email} · ${a.appliedAt}`);
  }

  await sendAdminNotice(env, "Bank of Sol — daily digest", lines, "digest");
}

// ── Booking reminders ───────────────────────────────────────────────────────
// Daily cron ⇒ remind every paid booking starting in the next 26 hours that
// hasn't been reminded. Notice ranges 0–26h depending on slot time — coarse
// but honest for a daily schedule; tighten by adding a second cron if needed.
// Skips bookings created <2h ago (their confirmation email just arrived).
async function sendReminders(env) {
  const now = Date.now();
  const horizon = new Date(now + 26 * 3600 * 1000).toISOString();
  const nowIso = new Date(now).toISOString();
  const freshCutoff = new Date(now - 2 * 3600 * 1000).toISOString();
  const due = await rows(
    env,
    `SELECT * FROM "booking"
      WHERE "status" = 'paid' AND "reminderSentAt" IS NULL
        AND "startAt" > ? AND "startAt" < ? AND "createdAt" < ?`,
    nowIso,
    horizon,
    freshCutoff
  );
  for (const booking of due) {
    const res = await sendBookingReminder(env, booking);
    if (res.ok) {
      try {
        await env.DB.prepare(
          'UPDATE "booking" SET "reminderSentAt" = ? WHERE "id" = ?'
        )
          .bind(new Date().toISOString(), booking.id)
          .run();
      } catch (e) {
        console.error(`[digest] reminder mark failed: ${e?.message || e}`);
      }
    }
  }
}

// ── Stale-pending hygiene ───────────────────────────────────────────────────
// Stripe's checkout.session.expired webhook (35-min sessions) is the real
// expiry path; this sweep only tidies rows >24h old whose webhook never
// arrived, purely so admin lists stay readable. Never touches anything fresh —
// a session that could still complete is left alone.
async function sweepStalePending(env) {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const now = new Date().toISOString();
  for (const table of ["shop_order", "booking"]) {
    try {
      await env.DB.prepare(
        `UPDATE "${table}" SET "status" = 'expired', "updatedAt" = ?
          WHERE "status" = 'pending' AND "createdAt" < ?`
      )
        .bind(now, cutoff)
        .run();
    } catch (e) {
      console.error(`[digest] sweep ${table} failed: ${e?.message || e}`);
    }
  }
}

export async function runDailyCron(env) {
  await sweepStalePending(env);
  await sendReminders(env);
  await sendDailyDigest(env);
}
