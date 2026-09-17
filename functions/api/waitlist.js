import { json, error, nowIso, str, clientIp } from "../lib/util.js";
import { sendWaitlistReceived, sendAdminNotice } from "../lib/email.js";

// POST /api/waitlist {email, name?, note?, website(honeypot)} — the one
// public write on the site. Defenses: honeypot, 5 per IP per day, capped
// lengths, UNIQUE email (a repeat just says "you're on it"). Confirmation to
// the person + a notice to Sol, both through email.js.
const MAX_PER_IP_PER_DAY = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (str(body.website, 50)) return json({ ok: true }, { status: 201 });

  const email = str(body.email, 160).toLowerCase();
  if (!EMAIL_RE.test(email)) return error(400, "Enter an email we can reach you at.");
  const name = str(body.name, 120) || null;
  const note = str(body.note, 500) || null;

  const ip = clientIp(request);
  if (ip) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM "waitlist" WHERE "ip" = ? AND "createdAt" > ?`
    )
      .bind(ip, since)
      .first();
    if ((row?.n || 0) >= MAX_PER_IP_PER_DAY) return error(429, "Too many sign-ups from here today.");
  }

  const dup = await env.DB.prepare(`SELECT 1 FROM "waitlist" WHERE "email" = ?`).bind(email).first();
  if (dup) return json({ ok: true, already: true }, { status: 200 });

  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO "waitlist" ("id","email","name","note","ip","source","status","createdAt","updatedAt")
     VALUES (?,?,?,?,?,?,'new',?,?)`
  )
    .bind(crypto.randomUUID(), email, name, note, ip || null, str(body.source, 200) || null, now, now)
    .run();

  await sendWaitlistReceived(env, { email, name });
  await sendAdminNotice(
    env,
    `Waitlist: ${name || email}`,
    [`${name || "(no name)"} <${email}>`, note ? `Note: ${note}` : "", "Review in Admin → Waitlist."].filter(Boolean),
    "waitlist-notice"
  );
  return json({ ok: true }, { status: 201 });
}
