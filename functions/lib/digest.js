// Daily cron work for the bankofsol-mailer Worker: admin digest, booking
// reminders, and stale-pending hygiene. Runs at 0 16 * * * UTC (8am PT).
//
// Every section guards its own queries — a table that doesn't exist yet (a
// migration not applied) must not kill the whole cron.
import {
  sendAdminNotice,
  sendBookingReminder,
  sendLoanDueNotice,
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
// New paid orders, paid bookings, and membership applications from the last 24h.
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
    `SELECT ma."appliedAt", u."email" FROM "member_account" ma
      JOIN "user" u ON u."id" = ma."userId"
      WHERE ma."status" = 'applied' AND ma."appliedAt" > ?`,
    since
  );
  const claims = await rows(
    env,
    `SELECT pc."chain", pc."createdAt", i."refCode", u."email"
       FROM "payment_claim" pc
       JOIN "invoice" i ON i."id" = pc."invoiceId"
       JOIN "user" u ON u."id" = pc."userId"
      WHERE pc."status" = 'pending'`
  );

  if (!orders.length && !bookings.length && !applications.length && !claims.length) return;

  const lines = [];
  if (claims.length) {
    lines.push(`⚠ Crypto claims waiting for review (${claims.length}):`);
    for (const c of claims) lines.push(`  ${c.refCode} via ${c.chain} — ${c.email}`);
  }
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
    lines.push(`Membership applications (${applications.length}):`);
    for (const a of applications) lines.push(`  ${a.email} · ${a.appliedAt}`);
  }

  await sendAdminNotice(env, "Bank of Sol — daily digest", lines, "digest");
}

// ── Monthly loan tracking ───────────────────────────────────────────────────
// On each active loan's dueDay (UTC), drop an amount-0 'loan_due' marker into
// the member's ledger — the monthly schedule made visible in the itemized
// list — and email the member. The marker doubles as the idempotency guard:
// one per loan per calendar month.
async function trackLoansMonthly(env) {
  const today = new Date();
  const day = today.getUTCDate();
  const monthKey = today.toISOString().slice(0, 7); // 'YYYY-MM'

  const due = await rows(
    env,
    `SELECT l.*, u."email", u."name" FROM "loan" l
      JOIN "user" u ON u."id" = l."userId"
     WHERE l."status" = 'active' AND l."dueDay" <= ? AND l."startDate" < ?`,
    day,
    `${monthKey}-32`
  );

  for (const loan of due) {
    // Skip the loan's first partial month and months already marked.
    if (loan.startDate.slice(0, 7) === monthKey) continue;
    try {
      const marked = await env.DB.prepare(
        `SELECT 1 FROM "ledger_entry"
          WHERE "loanId" = ? AND "kind" = 'loan_due' AND "entryDate" LIKE ?`
      )
        .bind(loan.id, `${monthKey}%`)
        .first();
      if (marked) continue;

      await env.DB.prepare(
        `INSERT INTO "ledger_entry"
           ("id","userId","kind","amountCents","loanId","note","createdBy","entryDate","createdAt")
         VALUES (?,?,'loan_due',0,?,?,?,?,?)`
      )
        .bind(
          crypto.randomUUID(),
          loan.userId,
          loan.id,
          `${loan.refCode} monthly payment due${loan.monthlyDueCents ? ` — $${(loan.monthlyDueCents / 100).toFixed(2)}` : ""}`,
          "system",
          new Date().toISOString(),
          new Date().toISOString()
        )
        .run();

      if (loan.email) await sendLoanDueNotice(env, { email: loan.email, name: loan.name }, loan);
    } catch (e) {
      console.error(`[digest] loan tracking failed for ${loan.refCode}: ${e?.message || e}`);
    }
  }
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
  await trackLoansMonthly(env);
  await sendDailyDigest(env);
}
