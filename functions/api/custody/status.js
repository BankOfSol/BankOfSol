import { requireUser, json } from "../../lib/util.js";

// GET /api/custody/status — the caller's custody application state; drives
// the locked-overlay progress tracker. null = never applied.
export async function onRequestGet({ request, env }) {
  const gate = await requireUser(env, request);
  if (gate.error) return gate.error;

  const row = await env.DB.prepare(
    `SELECT "status","motivation","appliedAt","decidedAt" FROM "custody_account"
      WHERE "userId" = ?`
  )
    .bind(gate.user.id)
    .first();

  return json({ custody: row || null, emailVerified: gate.user.emailVerified });
}
