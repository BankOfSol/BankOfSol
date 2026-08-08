import {
  requireSuperAdmin,
  json,
  error,
  logAdminActivity,
} from "../../lib/util.js";

// GET /api/superadmin/admins?search= — current admins, plus user search
// results when ?search= is present (to find someone to promote). Last-session
// join gives login recency at a glance.
export async function onRequestGet({ request, env }) {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();

  const admins = await env.DB.prepare(
    `SELECT u."id", u."name", u."email", u."isAdmin", u."isSuperAdmin",
            (SELECT MAX(s."createdAt") FROM "session" s WHERE s."userId" = u."id") AS "lastLoginAt"
       FROM "user" u WHERE u."isAdmin" = 1 OR u."isSuperAdmin" = 1
      ORDER BY u."isSuperAdmin" DESC, u."email"`
  ).all();

  let matches = [];
  if (search.length >= 2) {
    const res = await env.DB.prepare(
      `SELECT "id","name","email","isAdmin","isSuperAdmin" FROM "user"
        WHERE LOWER("email") LIKE ? OR LOWER("name") LIKE ?
        ORDER BY "email" LIMIT 20`
    )
      .bind(`%${search}%`, `%${search}%`)
      .all();
    matches = res.results || [];
  }

  return json({ admins: admins.results || [], matches });
}

// POST /api/superadmin/admins {userId, isAdmin} — grant or revoke the admin
// flag. isSuperAdmin is NEVER grantable here (or anywhere): it belongs to
// SUPER_ADMIN_EMAIL alone, self-healed at session time.
export async function onRequestPost({ request, env }) {
  const gate = await requireSuperAdmin(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const userId = String(body.userId || "");
  if (!userId) return error(400, "userId is required");
  const isAdmin = body.isAdmin ? 1 : 0;

  const target = await env.DB.prepare(
    `SELECT "id","email","isSuperAdmin" FROM "user" WHERE "id" = ?`
  )
    .bind(userId)
    .first();
  if (!target) return error(404, "User not found");
  if (target.isSuperAdmin) {
    return error(400, "The super admin's flags are fixed");
  }

  await env.DB.prepare(`UPDATE "user" SET "isAdmin" = ? WHERE "id" = ?`)
    .bind(isAdmin, userId)
    .run();

  await logAdminActivity(env, gate.user, isAdmin ? "admin.grant" : "admin.revoke", {
    userId,
    email: target.email,
  });
  return json({ ok: true });
}
