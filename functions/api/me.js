import { getSessionUser } from "../lib/auth.js";
import { json } from "../lib/util.js";

// Session snapshot for the SPA: the user (with admin flags) + custody state.
// Public — returns { user: null } for signed-out visitors, never an error.
export async function onRequest({ request, env }) {
  const user = await getSessionUser(env, request);
  if (!user) return json({ user: null, custody: null });

  let custody = null;
  try {
    custody = await env.DB.prepare(
      'SELECT "status","appliedAt","decidedAt" FROM "custody_account" WHERE "userId" = ?'
    )
      .bind(user.id)
      .first();
  } catch {
    /* custody table not migrated yet — treat as no application */
  }

  return json({ user, custody: custody || null });
}
