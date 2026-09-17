import { str, nowIso } from "./util.js";
import { isUsdPrice, usdToCents } from "./shop.js";
import { CHAINS, insertEntry } from "./ledger.js";
import { stripeRequest } from "./stripe.js";

// Reimbursements: receipts → AI scan → request → approval → payout.
// Conventions (mirrored in migrations/0007_reimbursements.sql):
//   * The member is the source of truth for merchant/date/total — the scan
//     pre-fills, the human confirms. Money is integer cents; parseFloat is
//     banned here too.
//   * Approval books kind 'reimbursement' (negative: Sol owes the member);
//     the payout books kind 'payout' (positive). Cash included — every rail
//     goes through the same manual approve → pay steps.
//   * Payout details are the member's PUBLIC receiving info (addresses,
//     handles, a Connect acct_ id). No keys, ever.

export const PAYOUT_METHODS = ["stripe", "crypto", "telegram", "cash"];
export const REIMB_STATUSES = ["submitted", "approved", "paid", "rejected"];
export const MAX_RECEIPTS_PER_REQUEST = 40;

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const makeReimbRef = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = "";
  for (const b of bytes) code += REF_ALPHABET[b % REF_ALPHABET.length];
  return `RMB-${code}`;
};

// ── Scan contract (shared with Ray's poller and the Workers AI fallback) ──────
// The model answers with ONE JSON object. Anything else is a failed scan.
export const SCAN_PROMPT = `You are reading a photo of a purchase receipt. Extract the facts into JSON and output ONLY the JSON object, no prose, no markdown fences.
Schema:
{"merchant": string|null, "date": "YYYY-MM-DD"|null, "total": "12.34"|null, "currency": "USD"|string|null, "tax": "1.23"|null, "payment_method": string|null, "items": [{"description": string, "qty": number|null, "amount": "1.23"|null}], "raw_text": string}
Rules: "total" is the final amount paid after tax and tip. Use a dot decimal and no currency symbol in amounts. If the date has no year, use the most likely recent year. "raw_text" is a faithful transcription of all legible text on the receipt, line by line. Unknown fields are null.`;

const looksLikeDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Normalize whatever a model returned into the row fields we store. Never
// throws; a garbage answer yields {ok:false}.
export function parseScan(text) {
  let raw = String(text || "").trim();
  // Strip ```json fences and any prose around the first {...} block.
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return { ok: false, error: "No JSON in model output" };
  raw = raw.slice(first, last + 1);
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Model output was not valid JSON" };
  }
  if (!obj || typeof obj !== "object") return { ok: false, error: "Model output was not an object" };

  const money = (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).replace(/[$,\s]/g, "");
    return isUsdPrice(s) ? usdToCents(s) : null;
  };
  const items = Array.isArray(obj.items)
    ? obj.items.slice(0, 80).map((it) => ({
        description: str(it?.description, 200),
        qty: Number.isFinite(+it?.qty) ? +it.qty : null,
        amountCents: money(it?.amount),
      })).filter((it) => it.description)
    : [];

  const date = str(obj.date, 10);
  return {
    ok: true,
    scan: {
      merchant: str(obj.merchant, 120) || null,
      date: looksLikeDate(date) ? date : null,
      totalCents: money(obj.total),
      currency: str(obj.currency, 8) || null,
      taxCents: money(obj.tax),
      paymentMethod: str(obj.payment_method, 60) || null,
      items,
      rawText: str(obj.raw_text, 8000) || null,
    },
  };
}

// Write a finished scan (or its failure) onto the receipt row. Only fills
// merchant/date/total when the member hasn't typed their own yet — the human
// wins over the model, always.
export async function applyScan(env, receipt, result, model) {
  const now = nowIso();
  if (!result.ok) {
    await env.DB.prepare(
      `UPDATE "receipt" SET "status" = 'failed', "scanError" = ?, "scanModel" = ?,
              "scannedAt" = ?, "updatedAt" = ? WHERE "id" = ?`
    )
      .bind(str(result.error, 300) || "Scan failed", model, now, now, receipt.id)
      .run();
    return;
  }
  const s = result.scan;
  await env.DB.prepare(
    `UPDATE "receipt"
        SET "status" = 'scanned', "scanJson" = ?, "scanModel" = ?, "scanError" = NULL,
            "scannedAt" = ?, "updatedAt" = ?,
            "merchant"     = COALESCE("merchant", ?),
            "purchaseDate" = COALESCE("purchaseDate", ?),
            "totalCents"   = COALESCE("totalCents", ?)
      WHERE "id" = ?`
  )
    .bind(JSON.stringify(s), model, now, now, s.merchant, s.date, s.totalCents, receipt.id)
    .run();
}

// ── Cloud fallback: Workers AI vision ────────────────────────────────────────
// Used when RECEIPT_SCAN_MODE=cloud, or on an explicit "rescan in the cloud".
// Ray's local Qwen model is the default path (see functions/api/ray/receipts.js).
export const CLOUD_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

export async function cloudScan(env, receipt) {
  if (!env.AI) return { ok: false, error: "Cloud scanning isn't enabled on this deployment" };
  const key = receipt.fileUrl.replace(/^\/api\/files\//, "");
  const obj = await env.BUCKET.get(key);
  if (!obj) return { ok: false, error: "Receipt image is missing from storage" };
  const bytes = new Uint8Array(await obj.arrayBuffer());
  try {
    const res = await env.AI.run(CLOUD_MODEL, {
      prompt: SCAN_PROMPT,
      image: Array.from(bytes),
      max_tokens: 1500,
    });
    const text = typeof res === "string" ? res : res?.response || res?.description || "";
    return parseScan(text);
  } catch (e) {
    return { ok: false, error: e?.message || "Workers AI call failed" };
  }
}

// ── Sanitizers ───────────────────────────────────────────────────────────────

// Loose public-address shape check, mirrored from sanitizeRail: blanks, URLs
// and anything key-shaped are refused.
function checkAddress(address, label) {
  if (address.length < 20) return `${label}: that doesn't look like an address`;
  if (/\s/.test(address) || /^(0x)?[0-9a-f]{128,}$/i.test(address) || /private|seed|mnemonic/i.test(address)) {
    return `${label}: paste the PUBLIC receiving address only`;
  }
  return null;
}

export function sanitizePayoutProfile(body) {
  const b = body && typeof body === "object" ? body : {};
  const method = str(b.method, 12);
  if (!PAYOUT_METHODS.includes(method)) return { error: "Pick how you want to be paid back" };

  const profile = {
    method,
    cryptoChain: null,
    cryptoAddress: null,
    cryptoTag: null,
    telegramHandle: null,
    telegramTonAddress: null,
    cashNote: null,
  };

  if (method === "crypto") {
    const chain = str(b.cryptoChain, 8).toUpperCase();
    if (!CHAINS.includes(chain)) return { error: "Chain must be XRP, SOL, BTC, or TON" };
    const address = str(b.cryptoAddress, 130);
    const bad = checkAddress(address, `${chain} address`);
    if (bad) return { error: bad };
    profile.cryptoChain = chain;
    profile.cryptoAddress = address;
    profile.cryptoTag = str(b.cryptoTag, 60) || null;
  } else if (method === "telegram") {
    const handle = str(b.telegramHandle, 40).replace(/^@/, "");
    if (!/^[A-Za-z0-9_]{5,32}$/.test(handle)) return { error: "Telegram username should be 5–32 letters, numbers, or underscores" };
    profile.telegramHandle = handle;
    const ton = str(b.telegramTonAddress, 130);
    if (ton) {
      const bad = checkAddress(ton, "TON address");
      if (bad) return { error: bad };
      profile.telegramTonAddress = ton;
    }
  } else if (method === "cash") {
    profile.cashNote = str(b.cashNote, 300) || null;
  }
  // stripe: nothing to type — the Connect onboarding fills stripeAccountId.
  return { profile };
}

// The member's editable receipt fields. Blank strings clear a value.
export function sanitizeReceiptEdit(body) {
  const b = body && typeof body === "object" ? body : {};
  const out = {};
  if ("merchant" in b) out.merchant = str(b.merchant, 120) || null;
  if ("note" in b) out.note = str(b.note, 500) || null;
  if ("purchaseDate" in b) {
    const d = str(b.purchaseDate, 10);
    if (d && !looksLikeDate(d)) return { error: "Date must be YYYY-MM-DD" };
    out.purchaseDate = d || null;
  }
  if ("total" in b) {
    const t = str(b.total, 16).replace(/[$,]/g, "");
    if (t && !isUsdPrice(t)) return { error: "Total must look like 42.50" };
    out.totalCents = t ? usdToCents(t) : null;
  }
  if (!Object.keys(out).length) return { error: "Nothing to update" };
  return { edit: out };
}

// The snapshot stored on a request — what Sol reads when paying it out.
export function payoutSnapshot(profile) {
  if (!profile) return null;
  switch (profile.method) {
    case "stripe":
      return { method: "stripe", stripeAccountId: profile.stripeAccountId, onboarded: !!profile.stripeOnboarded };
    case "crypto":
      return { method: "crypto", chain: profile.cryptoChain, address: profile.cryptoAddress, tag: profile.cryptoTag };
    case "telegram":
      return { method: "telegram", handle: profile.telegramHandle, tonAddress: profile.telegramTonAddress };
    default:
      return { method: "cash", note: profile.cashNote };
  }
}

export const publicProfile = (row) =>
  row
    ? {
        method: row.method,
        cryptoChain: row.cryptoChain,
        cryptoAddress: row.cryptoAddress,
        cryptoTag: row.cryptoTag,
        telegramHandle: row.telegramHandle,
        telegramTonAddress: row.telegramTonAddress,
        stripeConnected: !!row.stripeAccountId,
        stripeOnboarded: !!row.stripeOnboarded,
        cashNote: row.cashNote,
      }
    : null;

export const receiptShape = (row) => ({
  ...row,
  scan: row.scanJson ? safeJson(row.scanJson) : null,
  scanJson: undefined,
});

export const reimbursementShape = (row) => ({
  ...row,
  payout: row.payoutJson ? safeJson(row.payoutJson) : null,
  payoutJson: undefined,
});

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ── Ledger bookings ──────────────────────────────────────────────────────────

export async function bookApproval(env, reimb, createdBy) {
  return insertEntry(env, {
    userId: reimb.userId,
    kind: "reimbursement",
    amountCents: -Math.abs(reimb.totalCents),
    note: `${reimb.refCode} approved — ${reimb.title}`,
    reference: reimb.refCode,
    createdBy,
  });
}

export async function bookPayout(env, reimb, { method, reference, createdBy }) {
  return insertEntry(env, {
    userId: reimb.userId,
    kind: "payout",
    amountCents: Math.abs(reimb.totalCents),
    method,
    reference: reference || reimb.refCode,
    note: `${reimb.refCode} paid out — ${reimb.title}`,
    createdBy,
  });
}

// ── Stripe Connect (Express) — the card/bank payout rail ─────────────────────
// The member onboards once (Stripe collects their bank details, we never see
// them); a payout is a Transfer from Sol's Stripe balance to their account.
// Every call degrades to a clear message when Connect isn't enabled yet.

export async function stripeConnectOnboard(env, user, profile, returnBase) {
  let accountId = profile?.stripeAccountId || null;
  if (!accountId) {
    const acct = await stripeRequest(env, "POST", "/accounts", {
      type: "express",
      email: user.email,
      capabilities: { transfers: { requested: "true" } },
      business_type: "individual",
      metadata: { bosUserId: user.id },
    });
    accountId = acct.id;
  }
  const link = await stripeRequest(env, "POST", "/account_links", {
    account: accountId,
    refresh_url: `${returnBase}?stripe=refresh`,
    return_url: `${returnBase}?stripe=return`,
    type: "account_onboarding",
  });
  return { accountId, url: link.url };
}

export async function stripeConnectStatus(env, accountId) {
  const acct = await stripeRequest(env, "GET", `/accounts/${accountId}`);
  return { onboarded: !!(acct.payouts_enabled && acct.details_submitted), acct };
}

export async function stripeTransfer(env, reimb, accountId) {
  return stripeRequest(env, "POST", "/transfers", {
    amount: reimb.totalCents,
    currency: "usd",
    destination: accountId,
    description: `${reimb.refCode} — ${reimb.title}`,
    metadata: { kind: "bos_reimbursement", reimbursementId: reimb.id, refCode: reimb.refCode },
  });
}
