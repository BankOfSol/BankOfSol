import { requireUser, json } from "../../lib/util.js";

// GET /api/membership/status — the caller's application state; drives the
// locked-overlay progress tracker. null = never applied.
export async function onRequestGet({ request, env }) {
  const gate = await requireUser(env, request);
  if (gate.error) return gate.error;

  const row = await env.DB.prepare(
    `SELECT "status","motivation","appliedAt","decidedAt" FROM "member_account"
      WHERE "userId" = ?`
  )
    .bind(gate.user.id)
    .first();

  return json({ membership: row || null, emailVerified: gate.user.emailVerified });
}
