import { json, error, nowIso, str, clientIp } from "../../lib/util.js";
import { sendSolrayLeadReceived, sendSolrayLeadNotice } from "../../lib/email.js";

// POST /api/solray/pilot-request — public lead capture for the Sol & Ray
// landing page. No account, no payment: a district HR director will not sign
// up to ask a question. Defenses instead: a honeypot field, a per-IP cap, and
// length-capped fields. Every lead lands in `solray_lead` and fires two mails
// (confirmation to the requester, notice to Sol) — both via email.js, so they
// never throw and always leave an email_log row.
const MAX_PER_IP_PER_DAY = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Honeypot: real users never see or fill `website`. Bots do. Pretend it
  // worked so they don't iterate.
  if (str(body.website, 50)) return json({ ok: true }, { status: 201 });

  const lead = {
    name: str(body.name, 120),
    title: str(body.title, 120),
    org: str(body.org, 160),
    email: str(body.email, 160).toLowerCase(),
    phone: str(body.phone, 40),
    volume: str(body.volume, 60),
    message: str(body.message, 2000),
    source: str(body.source, 200),
  };
  if (!lead.name) return error(400, "Please tell us your name.");
  if (!lead.org) return error(400, "Please tell us your district or agency.");
  if (!EMAIL_RE.test(lead.email)) return error(400, "Please enter a work email we can reply to.");

  const ip = clientIp(request);
  if (ip) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const n = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM "solray_lead" WHERE "ip" = ? AND "createdAt" >= ?`
    )
      .bind(ip, since)
      .first()
      .catch(() => null);
    if ((n?.n ?? 0) >= MAX_PER_IP_PER_DAY) {
      return error(429, "Too many requests from here today — email us instead.");
    }
  }

  const now = nowIso();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO "solray_lead"
       ("id","name","title","org","email","phone","volume","message","source","ip","status","createdAt","updatedAt")
     VALUES (?,?,?,?,?,?,?,?,?,?,'new',?,?)`
  )
    .bind(
      id,
      lead.name,
      lead.title || null,
      lead.org,
      lead.email,
      lead.phone || null,
      lead.volume || null,
      lead.message || null,
      lead.source || null,
      ip || null,
      now,
      now
    )
    .run();

  await Promise.all([sendSolrayLeadReceived(env, lead), sendSolrayLeadNotice(env, lead)]);
  return json({ ok: true, id }, { status: 201 });
}
