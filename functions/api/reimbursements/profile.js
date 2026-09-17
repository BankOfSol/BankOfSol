import { requireMember, json, error, nowIso } from "../../lib/util.js";
import { returnBaseFor } from "../../lib/stripe.js";
import {
  sanitizePayoutProfile,
  publicProfile,
  stripeConnectOnboard,
  stripeConnectStatus,
} from "../../lib/reimburse.js";

// The member's payout profile — how they want reimbursements paid back.
//   GET  → {profile}
//   POST {method, …fields}                     → save (crypto/telegram/cash)
//   POST {action:'stripe_onboard', returnUrl}  → {url} Stripe Connect Express onboarding
//   POST {action:'stripe_refresh'}             → re-check onboarding with Stripe
// Only public receiving details are ever stored (addresses, a handle, an
// acct_ id). Stripe collects the bank details itself; we never see them.

const load = (env, userId) =>
  env.DB.prepare(`SELECT * FROM "payout_profile" WHERE "userId" = ?`).bind(userId).first();

export async function onRequestGet({ request, env }) {
  const gate = await requireMember(env, request);
  if (gate.error) return gate.error;
  return json({ profile: publicProfile(await load(env, gate.user.id)) });
}

export async function onRequestPost({ request, env }) {
  const gate = await requireMember(env, request);
  if (gate.error) return gate.error;
  const userId = gate.user.id;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }
  const now = nowIso();
  const existing = await load(env, userId);

  if (body.action === "stripe_onboard") {
    const returnBase = returnBaseFor(env, body.returnUrl);
    if (!returnBase) return error(400, "returnUrl is required (and must be one of ours)");
    let res;
    try {
      res = await stripeConnectOnboard(env, gate.user, existing, returnBase);
    } catch (e) {
      return error(503, `Stripe payouts aren't available yet: ${e.message}`);
    }
    await upsert(env, userId, existing, { method: "stripe", stripeAccountId: res.accountId, stripeOnboarded: 0 }, now);
    return json({ url: res.url });
  }

  if (body.action === "stripe_refresh") {
    if (!existing?.stripeAccountId) return error(409, "Stripe payouts aren't set up yet");
    let status;
    try {
      status = await stripeConnectStatus(env, existing.stripeAccountId);
    } catch (e) {
      return error(503, e.message);
    }
    await upsert(env, userId, existing, { stripeOnboarded: status.onboarded ? 1 : 0 }, now);
    return json({ profile: publicProfile(await load(env, userId)) });
  }

  const s = sanitizePayoutProfile(body);
  if (s.error) return error(400, s.error);
  if (s.profile.method === "stripe" && !existing?.stripeAccountId) {
    return error(409, "Start the Stripe payout setup to use card/bank payouts");
  }
  await upsert(env, userId, existing, s.profile, now);
  return json({ profile: publicProfile(await load(env, userId)) });
}

async function upsert(env, userId, existing, fields, now) {
  if (!existing) {
    const row = {
      method: "cash",
      cryptoChain: null,
      cryptoAddress: null,
      cryptoTag: null,
      telegramHandle: null,
      telegramTonAddress: null,
      stripeAccountId: null,
      stripeOnboarded: 0,
      cashNote: null,
      ...fields,
    };
    await env.DB.prepare(
      `INSERT INTO "payout_profile"
         ("userId","method","cryptoChain","cryptoAddress","cryptoTag","telegramHandle",
          "telegramTonAddress","stripeAccountId","stripeOnboarded","cashNote","createdAt","updatedAt")
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
      .bind(
        userId, row.method, row.cryptoChain, row.cryptoAddress, row.cryptoTag, row.telegramHandle,
        row.telegramTonAddress, row.stripeAccountId, row.stripeOnboarded, row.cashNote, now, now
      )
      .run();
    return;
  }
  const keys = Object.keys(fields);
  await env.DB.prepare(
    `UPDATE "payout_profile" SET ${keys.map((k) => `"${k}" = ?`).join(", ")}, "updatedAt" = ? WHERE "userId" = ?`
  )
    .bind(...keys.map((k) => fields[k]), now, userId)
    .run();
}
