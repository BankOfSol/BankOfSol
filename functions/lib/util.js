import { getSessionUser } from "./auth.js";

export const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });

export const error = (status, message) => json({ error: message }, { status });

export const nowIso = () => new Date().toISOString();

// Coerce any input to a trimmed, length-capped string. Every sanitizer builds
// on this so user-supplied fields can't smuggle objects or megabytes.
export const str = (v, max = 500) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

// Caller's IP as Cloudflare saw it — used for per-IP spam caps on the public
// checkout/apply endpoints.
export const clientIp = (request) =>
  request.headers.get("cf-connecting-ip") || "";

// ── Gates ───────────────────────────────────────────────────────────────────
// Every route calls its gate explicitly (no middleware). Each returns
// { user } or { error: Response } — routes do `if (gate.error) return gate.error`.
// Server-side always: UI toggles are presentation, these are the enforcement.

export async function requireUser(env, request) {
  const user = await getSessionUser(env, request);
  if (!user) return { error: error(401, "Not signed in") };
  return { user };
}

// Signed in AND email verified — for actions where the contact address must be
// provably real (membership applications).
export async function requireVerifiedUser(env, request) {
  const gate = await requireUser(env, request);
  if (gate.error) return gate;
  if (!gate.user.emailVerified) {
    return {
      error: error(403, "Please verify your email first — check your inbox."),
    };
  }
  return gate;
}

// Server-side admin check (NOT just a hidden UI element).
export async function requireAdmin(env, request) {
  const user = await getSessionUser(env, request);
  if (!user) return { error: error(401, "Not signed in") };
  if (!user.isAdmin) return { error: error(403, "Admins only") };
  return { user };
}

// The single super admin (SUPER_ADMIN_EMAIL / ADMIN_EMAIL). Manages other
// admins and the crypto payment rails; regular admins get a 403 here.
export async function requireSuperAdmin(env, request) {
  const user = await getSessionUser(env, request);
  if (!user) return { error: error(401, "Not signed in") };
  if (!user.isSuperAdmin) return { error: error(403, "Super admin only") };
  return { user };
}

// Approved member (or admin). Guards the billing/account endpoints; the
// application/status endpoints stay on requireUser so a pending applicant can
// always see where they stand.
export async function requireMember(env, request) {
  const gate = await requireUser(env, request);
  if (gate.error) return gate;
  if (gate.user.isAdmin) return gate;
  const row = await env.DB.prepare(
    `SELECT 1 FROM "member_account" WHERE "userId" = ? AND "status" = 'approved'`
  )
    .bind(gate.user.id)
    .first();
  if (!row) {
    return { error: error(403, "Members only — apply for membership first.") };
  }
  return gate;
}

// Best-effort audit trail for admin mutations. Never throws — an audit-write
// hiccup must not turn an approve/reject into a 500 (same discipline as
// email.js). `detail` is JSON-stringified context (target ids, flags...).
export async function logAdminActivity(env, user, action, detail = null) {
  try {
    await env.DB.prepare(
      'INSERT INTO "admin_activity" ("id","userId","actorEmail","action","detail","createdAt") VALUES (?,?,?,?,?,?)'
    )
      .bind(
        crypto.randomUUID(),
        user?.id || null,
        user?.email || null,
        action,
        detail ? JSON.stringify(detail) : null,
        nowIso()
      )
      .run();
  } catch (e) {
    console.error("admin_activity log failed:", e?.message || e);
  }
}
