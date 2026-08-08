import { requireVerifiedUser, json, error, nowIso, str, clientIp } from "../../lib/util.js";
import { sendMembershipApplied } from "../../lib/email.js";

// POST /api/membership/apply {motivation} — one application per user (UNIQUE
// on userId), verified email required: the member list is only worth anything
// if every address on it is real. Approval is Sol's alone, from the admin
// queue.
export async function onRequestPost({ request, env }) {
  const gate = await requireVerifiedUser(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Light per-IP cap: accounts are already unique, this just slows down
  // scripted signup+apply loops from one place.
  const ip = clientIp(request);
  if (ip) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const n = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM "member_account" ma
        JOIN "session" s ON s."userId" = ma."userId"
       WHERE s."ipAddress" = ? AND ma."appliedAt" >= ?`
    )
      .bind(ip, since)
      .first()
      .catch(() => null);
    if ((n?.n ?? 0) >= 5) {
      return error(429, "Too many applications from here today — try again tomorrow");
    }
  }

  const existing = await env.DB.prepare(
    `SELECT "status" FROM "member_account" WHERE "userId" = ?`
  )
    .bind(gate.user.id)
    .first();
  if (existing) {
    return error(409, `You've already applied — status: ${existing.status}`);
  }

  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO "member_account"
       ("id","userId","status","motivation","appliedAt","createdAt","updatedAt")
     VALUES (?,?,'applied',?,?,?,?)`
  )
    .bind(
      crypto.randomUUID(),
      gate.user.id,
      str(body.motivation, 1000) || null,
      now,
      now,
      now
    )
    .run();

  await sendMembershipApplied(env, gate.user);
  return json({ ok: true, status: "applied", appliedAt: now }, { status: 201 });
}
