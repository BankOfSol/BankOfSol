import { requireSuperAdmin, json } from "../../../lib/util.js";
import { hubSummary } from "../../../lib/hub.js";

// GET /api/superadmin/hub — the whole command center in one call.
export async function onRequestGet({ request, env }) {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;
  return json(await hubSummary(env));
}
