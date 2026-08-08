import { requireSuperAdmin, json } from "../../lib/util.js";

// GET /api/superadmin/activity — the admin_activity feed, newest first.
export async function onRequestGet({ request, env }) {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;

  const { results } = await env.DB.prepare(
    `SELECT * FROM "admin_activity" ORDER BY "createdAt" DESC LIMIT 200`
  ).all();

  return json({ activity: results || [] });
}
