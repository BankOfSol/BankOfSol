import { str, nowIso } from "./util.js";
import { isUsdPrice, usdToCents } from "./shop.js";

// Consulting bookings: availability rules live as wall-clock windows in Sol's
// timezone; the API speaks UTC instants; the client renders in the visitor's
// timezone. Slots are computed on request — never materialized — and a slot is
// only ever consumed by a booking row inserted through the race-safe guarded
// INSERT below.

export const BUSINESS_TZ = "America/Los_Angeles";

export const BOOKING_STATUSES = [
  "pending",
  "paid",
  "completed",
  "cancelled",
  "refunded",
  "expired",
];

// Legal admin transitions. pending→expired happens via Stripe's
// checkout.session.expired (or the daily sweep); everything after paid is an
// admin/buyer action.
export const BOOKING_TRANSITIONS = {
  pending: ["paid", "cancelled", "expired"],
  paid: ["completed", "cancelled", "refunded"],
  completed: [],
  cancelled: [],
  refunded: [],
  expired: [],
};

// Cancellations at least this many hours before start auto-refund in full;
// inside the cutoff it's admin discretion. Shown to the buyer pre-checkout.
export const CANCEL_CUTOFF_HOURS = 24;

// A pending row holds its slot for this long (Stripe sessions expire at ~35
// minutes; the extra margin covers clock skew). Older pendings don't block.
export const PENDING_HOLD_MIN = 40;

// Public spam caps (same philosophy as the shop's).
export const MAX_OPEN_PER_USER = 3;
export const MAX_PENDING_PER_IP = 6;
export const IP_WINDOW_MS = 60 * 60 * 1000;

// ── Timezone math ───────────────────────────────────────────────────────────

// UTC instant of wall-clock HH:MM in `tz` on calendar date `dateIso`
// ('YYYY-MM-DD'). Generalized from PoundPlay's zonedNoon: DST jumps happen at
// ~2 AM, never inside business hours, so a single offset lookup is exact for
// any window an admin would realistically open.
export function zonedTime(dateIso, hhmm, tz = BUSINESS_TZ) {
  const [h, m] = String(hhmm).split(":").map(Number);
  const guess = Date.parse(
    `${dateIso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`
  );
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(guess).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute);
  return new Date(guess - (asUTC - guess));
}

// The calendar date ('YYYY-MM-DD') and weekday (0=Sunday) of a UTC instant,
// as seen in `tz`.
export function zonedDateParts(date, tz = BUSINESS_TZ) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday };
}

const isHHMM = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ""));
const isDateIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const hhmmToMin = (s) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
const minToHHMM = (n) =>
  `${String(Math.trunc(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

// Step a 'YYYY-MM-DD' string forward one calendar day (pure string math via
// UTC noon so DST can't shift the date).
const nextDate = (dateIso) => {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

// ── Slot computation ────────────────────────────────────────────────────────

// Open slots for `service` across LA calendar dates [fromDate, toDate]
// (inclusive, 'YYYY-MM-DD'). Returns bare [{startAt, endAt}] UTC ISO pairs —
// no internal ids leak to the public endpoint. Rules minus 'closed'
// exceptions plus 'open' exceptions; a slot must fit its window including the
// service's buffer, start after the lead-time gate, and clear every paid or
// fresh-pending booking (with buffer on both sides).
export async function computeSlots(env, service, fromDate, toDate) {
  const now = Date.now();
  const leadGate = now + service.leadHours * 3600 * 1000;
  const horizon = now + service.maxDaysAhead * 24 * 3600 * 1000;

  const [rulesRes, excRes] = await Promise.all([
    env.DB.prepare(`SELECT * FROM "availability_rule" WHERE "active" = 1`).all(),
    env.DB.prepare(
      `SELECT * FROM "availability_exception" WHERE "date" >= ? AND "date" <= ?`
    )
      .bind(fromDate, toDate)
      .all(),
  ]);
  const rules = rulesRes.results || [];
  const exceptions = excRes.results || [];

  // Existing bookings that can block a slot, over a padded window.
  const windowStart = new Date(now - 24 * 3600 * 1000).toISOString();
  const windowEnd = new Date(
    zonedTime(toDate, "23:59").getTime() + 24 * 3600 * 1000
  ).toISOString();
  const freshCutoff = new Date(now - PENDING_HOLD_MIN * 60 * 1000).toISOString();
  const bookedRes = await env.DB.prepare(
    `SELECT "startAt","endAt" FROM "booking"
      WHERE ("status" = 'paid' OR "status" = 'completed'
             OR ("status" = 'pending' AND "createdAt" > ?))
        AND "startAt" < ? AND "endAt" > ?`
  )
    .bind(freshCutoff, windowEnd, windowStart)
    .all();
  const booked = (bookedRes.results || []).map((b) => ({
    start: Date.parse(b.startAt),
    end: Date.parse(b.endAt),
  }));

  const bufferMs = service.bufferMin * 60 * 1000;
  const durationMs = service.durationMin * 60 * 1000;
  const slots = [];

  for (let day = fromDate; day <= toDate; day = nextDate(day)) {
    const dayExceptions = exceptions.filter((e) => e.date === day);
    if (dayExceptions.some((e) => e.kind === "closed")) continue;

    // Weekday of this LA calendar date (noon anchor dodges DST edges).
    const { weekday } = zonedDateParts(zonedTime(day, "12:00"));

    const windows = [
      ...rules
        .filter((r) => r.weekday === weekday)
        .map((r) => ({ start: r.startTime, end: r.endTime })),
      ...dayExceptions
        .filter((e) => e.kind === "open" && isHHMM(e.startTime) && isHHMM(e.endTime))
        .map((e) => ({ start: e.startTime, end: e.endTime })),
    ];

    for (const w of windows) {
      const startMin = hhmmToMin(w.start);
      const endMin = hhmmToMin(w.end);
      for (
        let t = startMin;
        t + service.durationMin + service.bufferMin <= endMin;
        t += service.slotEveryMin
      ) {
        const start = zonedTime(day, minToHHMM(t)).getTime();
        const end = start + durationMs;
        if (start < leadGate || start > horizon) continue;
        const clash = booked.some(
          (b) => b.start < end + bufferMs && b.end + bufferMs > start
        );
        if (clash) continue;
        slots.push({
          startAt: new Date(start).toISOString(),
          endAt: new Date(end).toISOString(),
        });
      }
    }
  }

  // Windows can overlap (rule + open exception) — dedupe and sort.
  const seen = new Set();
  return slots
    .filter((s) => (seen.has(s.startAt) ? false : (seen.add(s.startAt), true)))
    .sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
}

// ── Race-safe booking insert ────────────────────────────────────────────────

// D1 has no multi-statement transactions; the guarded conditional INSERT is
// the atomic primitive. The row goes in only if NO paid/completed/fresh-
// pending booking overlaps the slot (buffer applied on both sides) —
// `meta.changes === 0` means someone else just took it (caller 409s).
export async function insertBookingIfFree(env, booking, bufferMin) {
  const guardStart = new Date(
    Date.parse(booking.startAt) - bufferMin * 60 * 1000
  ).toISOString();
  const guardEnd = new Date(
    Date.parse(booking.endAt) + bufferMin * 60 * 1000
  ).toISOString();
  const freshCutoff = new Date(Date.now() - PENDING_HOLD_MIN * 60 * 1000).toISOString();

  const res = await env.DB.prepare(
    `INSERT INTO "booking"
       ("id","serviceId","userId","buyerEmail","buyerName","buyerTz","buyerIp",
        "refCode","icsToken","serviceName","startAt","endAt","priceCents","note",
        "status","createdAt","updatedAt")
     SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?
      WHERE NOT EXISTS (
        SELECT 1 FROM "booking"
         WHERE ("status" = 'paid' OR "status" = 'completed'
                OR ("status" = 'pending' AND "createdAt" > ?))
           AND "startAt" < ? AND "endAt" > ?
      )`
  )
    .bind(
      booking.id,
      booking.serviceId,
      booking.userId,
      booking.buyerEmail,
      booking.buyerName,
      booking.buyerTz,
      booking.buyerIp,
      booking.refCode,
      booking.icsToken,
      booking.serviceName,
      booking.startAt,
      booking.endAt,
      booking.priceCents,
      booking.note,
      booking.createdAt,
      booking.createdAt,
      freshCutoff,
      guardEnd,
      guardStart
    )
    .run();
  return (res.meta?.changes ?? 0) === 1;
}

// ── Sanitizers (shared by create + update so they can't drift) ──────────────

export function sanitizeService(body) {
  const b = body && typeof body === "object" ? body : {};

  const name = str(b.name, 80);
  if (!name) return { error: "Give the service a name" };

  const slug = str(b.slug, 60).toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return { error: "Slug must be lowercase letters/numbers/dashes (like website-dev)" };
  }

  const durationMin = Math.trunc(+b.durationMin);
  if (!Number.isInteger(durationMin) || durationMin < 15 || durationMin > 480) {
    return { error: "Duration must be 15–480 minutes" };
  }

  const price = str(b.price, 16);
  let priceCents;
  if (price) {
    if (!isUsdPrice(price)) return { error: "Price must be a dollar amount like 150.00" };
    priceCents = usdToCents(price);
  } else if (Number.isInteger(+b.priceCents) && +b.priceCents > 0) {
    priceCents = +b.priceCents;
  } else {
    return { error: "Price must be a dollar amount like 150.00" };
  }

  const intIn = (v, def, lo, hi) => {
    if (v === undefined || v === null || v === "") return def;
    const n = Math.trunc(+v);
    return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
  };
  const slotEveryMin = intIn(b.slotEveryMin, 30, 15, 240);
  const bufferMin = intIn(b.bufferMin, 15, 0, 120);
  const leadHours = intIn(b.leadHours, 12, 0, 168);
  const maxDaysAhead = intIn(b.maxDaysAhead, 30, 1, 90);
  if ([slotEveryMin, bufferMin, leadHours, maxDaysAhead].some((v) => v === null)) {
    return { error: "Check the scheduling numbers — one of them is out of range" };
  }

  return {
    service: {
      slug,
      name,
      description: str(b.description, 2000) || null,
      durationMin,
      priceCents,
      slotEveryMin,
      bufferMin,
      leadHours,
      maxDaysAhead,
      active: b.active === false || b.active === 0 ? 0 : 1,
      sortOrder: Number.isFinite(+b.sortOrder) ? Math.trunc(+b.sortOrder) : 0,
    },
  };
}

export function sanitizeRule(body) {
  const b = body && typeof body === "object" ? body : {};
  const weekday = Math.trunc(+b.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { error: "Weekday must be 0 (Sunday) through 6 (Saturday)" };
  }
  const startTime = str(b.startTime, 5);
  const endTime = str(b.endTime, 5);
  if (!isHHMM(startTime) || !isHHMM(endTime)) {
    return { error: "Times must be HH:MM (24-hour)" };
  }
  if (hhmmToMin(startTime) >= hhmmToMin(endTime)) {
    return { error: "The window must end after it starts" };
  }
  return {
    rule: {
      weekday,
      startTime,
      endTime,
      active: b.active === false || b.active === 0 ? 0 : 1,
    },
  };
}

export function sanitizeException(body) {
  const b = body && typeof body === "object" ? body : {};
  const date = str(b.date, 10);
  if (!isDateIso(date)) return { error: "Date must be YYYY-MM-DD" };
  const kind = str(b.kind, 10);
  if (!["closed", "open"].includes(kind)) return { error: "Kind must be closed or open" };
  let startTime = null;
  let endTime = null;
  if (kind === "open") {
    startTime = str(b.startTime, 5);
    endTime = str(b.endTime, 5);
    if (!isHHMM(startTime) || !isHHMM(endTime)) {
      return { error: "An open window needs HH:MM start and end times" };
    }
    if (hhmmToMin(startTime) >= hhmmToMin(endTime)) {
      return { error: "The window must end after it starts" };
    }
  }
  return {
    exception: { date, kind, startTime, endTime, note: str(b.note, 200) || null },
  };
}

// ── Public shapes ───────────────────────────────────────────────────────────

export function publicService(row) {
  const { createdAt, updatedAt, active, ...rest } = row;
  return rest;
}

// ── .ics generation ─────────────────────────────────────────────────────────

// Hand-written RFC 5545 VEVENT — a dependency would be bigger than the format.
// All times in UTC 'Z' form; escaping per spec (comma, semicolon, backslash,
// newline).
const icsEscape = (s = "") =>
  String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
const icsTime = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function bookingIcs(booking) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bank of Sol//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.id}@bankofsol.app`,
    `DTSTAMP:${icsTime(booking.createdAt || new Date().toISOString())}`,
    `DTSTART:${icsTime(booking.startAt)}`,
    `DTEND:${icsTime(booking.endAt)}`,
    `SUMMARY:${icsEscape(`${booking.serviceName} — Bank of Sol`)}`,
    `DESCRIPTION:${icsEscape(
      [
        `Ref: ${booking.refCode}`,
        booking.meetingUrl ? `Join: ${booking.meetingUrl}` : "Meeting link arrives by email before the session.",
      ].join("\n")
    )}`,
    ...(booking.meetingUrl ? [`URL:${booking.meetingUrl}`] : []),
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // RFC 5545 wants CRLF line endings.
  return lines.join("\r\n") + "\r\n";
}
