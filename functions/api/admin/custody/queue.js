import { requireAdmin, json, error } from "../../../lib/util.js";

const STATUSES = ["applied", "approved", "rejected", "suspended", "closed"];

// GET /api/admin/custody/queue?status= — applications with their applicant,
// oldest first (the queue is FIFO by default).
export async function onRequestGet({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "applied";
  if (status !== "all" && !STATUSES.includes(status)) {
    return error(400, "Invalid status filter");
  }

  const binds = [];
  let where = "1=1";
  if (status !== "all") {
    where = 'ca."status" = ?';
    binds.push(status);
  }

  const { results } = await env.DB.prepare(
    `SELECT ca.*, u."email", u."name", u."createdAt" AS "userSince"
       FROM "custody_account" ca JOIN "user" u ON u."id" = ca."userId"
      WHERE ${where}
      ORDER BY ca."appliedAt" LIMIT 200`
  )
    .bind(...binds)
    .all();

  return json({ applications: results || [] });
}
