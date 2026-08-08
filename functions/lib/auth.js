import { betterAuth } from "better-auth";
import { D1Dialect } from "kysely-d1";
import {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendResetPasswordEmail,
  sendChangeEmailConfirmation,
} from "./email.js";

// Better Auth instance, built lazily and cached per isolate (keyed on the D1
// binding so it survives across requests but rebuilds if the binding changes).
// Pinned to better-auth 1.6.23 — several comments below encode 1.6.23-specific
// behaviors; re-verify them all before any version bump.
let _auth = null;
let _db = null;

export function getAuth(env) {
  if (_auth && _db === env.DB) return _auth;
  _db = env.DB;

  // Cross-subdomain sessions: shop.bankofsol.app is a different origin from
  // bankofsol.app, and Better Auth cookies are host-only by default. In
  // production the cookie domain widens to .bankofsol.app so one login works
  // on apex + www + shop. Gated on the prod URL: an explicit domain attribute
  // on localhost would make the browser reject the cookie entirely.
  const isProd = (env.BETTER_AUTH_URL || "").includes("bankofsol.app");

  _auth = betterAuth({
    database: {
      dialect: new D1Dialect({ database: env.DB }),
      type: "sqlite",
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // Better Auth rejects auth requests whose browser Origin doesn't match one
    // of these ("invalid origin"). baseURL's origin is trusted automatically;
    // APP_ORIGINS (comma-separated var) extends the list — locally that's the
    // vite dev origin, later it could be a companion app.
    trustedOrigins: [
      "https://bankofsol.app",
      "https://www.bankofsol.app",
      "https://shop.bankofsol.app",
      // wrangler dev simulates the first configured route, so local requests
      // arrive addressed as http://bankofsol.app — trust that shape in dev
      // ONLY. (In production it's unreachable anyway: .app is HSTS-preloaded,
      // so no browser will ever present a plain-http bankofsol.app origin.)
      ...(isProd ? [] : ["http://bankofsol.app", "http://www.bankofsol.app", "http://shop.bankofsol.app"]),
      ...(env.APP_ORIGINS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ],
    // Email verification is a HARD gate: you cannot sign in until you've
    // confirmed your address (requireEmailVerification below). Unverified
    // accounts never get a session — the membership waitlist starts from a
    // provably real address.
    emailVerification: {
      sendOnSignUp: true,
      // A blocked sign-in (unverified) resends a fresh 24h link, so someone
      // whose original token expired can recover straight from the login page
      // without a resend UI. (1.6.23 only resends here if this is true.)
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24, // 24h (library default is 1h)
      sendVerificationEmail: ({ user, url }) => sendVerificationEmail(env, user, url),
      // The welcome mail — fires once the address is proven.
      afterEmailVerification: (user) => sendWelcomeEmail(env, user),
    },
    emailAndPassword: {
      enabled: true,
      // Hard gate: block sign-in until emailVerified. NOTE (1.6.23): turning
      // this on ALSO suppresses auto-sign-in at signup — a new account has no
      // session until it clicks the link, so Signup.jsx shows a "check your
      // email" state instead of routing to /dashboard. Failed logins throw
      // EMAIL_NOT_VERIFIED, which Login.jsx surfaces with a friendly message.
      requireEmailVerification: true,
      autoSignIn: true,
      minPasswordLength: 8,
      sendResetPassword: ({ user, url }) => sendResetPasswordEmail(env, user, url),
    },
    user: {
      // Email change from /account is confirmed, not applied blind. NOTE
      // (better-auth 1.6.23): the callback is `sendChangeEmailConfirmation`
      // (NOT ...Verification, which is what most docs say), and it mails the
      // user's CURRENT address — that's the point, it's the address that can
      // veto the change.
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: false,
        sendChangeEmailConfirmation: ({ user, newEmail, url }) =>
          sendChangeEmailConfirmation(env, user, newEmail, url),
      },
      additionalFields: {
        // Admin flags. input:false => clients can NOT set these at signup, so
        // they can't self-escalate. Real gating is in requireAdmin /
        // requireSuperAdmin. isSuperAdmin is reserved to SUPER_ADMIN_EMAIL
        // (self-healed below) and is never grantable through any endpoint.
        isAdmin: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
        isSuperAdmin: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
      },
    },
    advanced: {
      ...(isProd
        ? { crossSubDomainCookies: { enabled: true, domain: ".bankofsol.app" } }
        : {}),
      defaultCookieAttributes: {
        sameSite: "Lax",
        secure: (env.BETTER_AUTH_URL || "").startsWith("https"),
      },
    },
  });
  return _auth;
}

// Returns the signed-in user (with resolved admin flags) or null.
export async function getSessionUser(env, request) {
  const session = await getAuth(env).api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  const u = session.user;
  // SUPER_ADMIN_EMAIL defaults to ADMIN_EMAIL, so Sol is super admin with no
  // new var. Super implies admin; regular admins are promoted per-user from
  // /superadmin.
  const superEmail = env.SUPER_ADMIN_EMAIL || env.ADMIN_EMAIL;
  const superByEmail =
    superEmail && u.email && u.email.toLowerCase() === superEmail.toLowerCase();
  const adminByEmail =
    superByEmail ||
    (env.ADMIN_EMAIL &&
      u.email &&
      u.email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase());
  const isSuperAdmin = !!u.isSuperAdmin || !!superByEmail;
  const isAdmin = !!u.isAdmin || !!adminByEmail || isSuperAdmin;

  // Self-heal: if this is the configured (super) admin email but the columns
  // are still 0, promote them so the flags are authoritative in the DB too.
  if ((adminByEmail && !u.isAdmin) || (superByEmail && !u.isSuperAdmin)) {
    try {
      await env.DB.prepare(
        'UPDATE "user" SET "isAdmin" = 1, "isSuperAdmin" = MAX("isSuperAdmin", ?) WHERE "id" = ?'
      )
        .bind(superByEmail ? 1 : 0, u.id)
        .run();
    } catch {
      /* non-fatal */
    }
  }

  return {
    id: u.id,
    email: u.email,
    name: u.name,
    image: u.image || null,
    isAdmin,
    isSuperAdmin,
    emailVerified: !!u.emailVerified,
  };
}
