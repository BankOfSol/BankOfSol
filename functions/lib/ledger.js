import { str, nowIso } from "./util.js";
import { isUsdPrice, usdToCents } from "./shop.js";
import { sendInvoiceOpened, sendPaymentReceived } from "./email.js";

// The banking core: invoices, the signed ledger, loans, crypto payment
// claims. Conventions (mirrored in migrations/0005_member_ledger.sql):
//
//   * ledger amountCents is SIGNED — positive means the member owes Sol more
//     (invoice opened, loan disbursed), negative is credit (payment, refund).
//     balance = SUM(amountCents); > 0 owes, < 0 is account credit.
//   * Claims are intents, the ledger is facts: a crypto payment only becomes
//     a ledger entry when Sol confirms it against the chain by hand.
//   * All money is integer cents. parseFloat is banned in this file.

export const CHAINS = ["XRP", "SOL", "BTC", "TON"];
export const PAY_METHODS = ["stripe", ...CHAINS, "other"];

export const INVOICE_STATUSES = ["draft", "open", "partial", "paid", "void"];
export const LOAN_STATUSES = ["active", "paid", "defaulted", "forgiven", "closed"];
export const ENGAGEMENT_STATUSES = ["onboarding", "active", "paused", "completed", "closed"];

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const makeRef = (prefix) => {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = "";
  for (const b of bytes) code += REF_ALPHABET[b % REF_ALPHABET.length];
  return `${prefix}-${code}`;
};
export const makeInvoiceRef = () => makeRef("INV");
export const makeLoanRef = () => makeRef("LOAN");

// ── Ledger primitives ───────────────────────────────────────────────────────

export async function insertEntry(env, entry) {
  const id = crypto.randomUUID();
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO "ledger_entry"
       ("id","userId","kind","amountCents","method","reference","invoiceId",
        "loanId","note","createdBy","entryDate","createdAt")
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      id,
      entry.userId,
      entry.kind,
      entry.amountCents,
      entry.method || null,
      entry.reference || null,
      entry.invoiceId || null,
      entry.loanId || null,
      entry.note || null,
      entry.createdBy,
      entry.entryDate || now,
      now
    )
    .run();
  return id;
}

export async function balanceFor(env, userId) {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM("amountCents"), 0) AS balance FROM "ledger_entry" WHERE "userId" = ?`
  )
    .bind(userId)
    .first();
  return row?.balance ?? 0;
}

// ── Invoice lifecycle ───────────────────────────────────────────────────────

// Record a payment against an invoice from ANY rail (Stripe webhook, admin
// manual entry, confirmed crypto claim). Writes the negative ledger entry,
// bumps paidCents, resolves partial/paid, and emails the member. Overpayment
// is allowed — the excess simply leaves the account in credit.
export async function recordInvoicePayment(
  env,
  invoice,
  amountCents,
  { method, reference, createdBy, note } = {}
) {
  const now = nowIso();
  await insertEntry(env, {
    userId: invoice.userId,
    kind: "payment",
    amountCents: -Math.abs(amountCents),
    method: method || "other",
    reference,
    invoiceId: invoice.id,
    note: note || `Payment on ${invoice.refCode}`,
    createdBy: createdBy || "system",
  });
  const paidCents = (invoice.paidCents || 0) + Math.abs(amountCents);
  const status = paidCents >= invoice.totalCents ? "paid" : "partial";
  await env.DB.prepare(
    `UPDATE "invoice" SET "paidCents" = ?, "status" = ?,
            "paidAt" = CASE WHEN ? = 'paid' THEN ? ELSE "paidAt" END,
            "updatedAt" = ?
      WHERE "id" = ?`
  )
    .bind(paidCents, status, status, now, now, invoice.id)
    .run();

  const member = await env.DB.prepare(`SELECT "email","name" FROM "user" WHERE "id" = ?`)
    .bind(invoice.userId)
    .first();
  if (member?.email) {
    await sendPaymentReceived(env, member, invoice, Math.abs(amountCents), status);
  }
  return { paidCents, status };
}

// Open a draft invoice: posts the ledger charge and emails the member. The
// caller has verified ownership and draft status.
export async function openInvoice(env, invoice, createdBy) {
  const now = nowIso();
  await env.DB.prepare(
    `UPDATE "invoice" SET "status" = 'open', "openedAt" = ?, "updatedAt" = ? WHERE "id" = ?`
  )
    .bind(now, now, invoice.id)
    .run();
  await insertEntry(env, {
    userId: invoice.userId,
    kind: "invoice",
    amountCents: invoice.totalCents,
    invoiceId: invoice.id,
    note: `${invoice.refCode} — ${invoice.title}`,
    createdBy,
  });
  const member = await env.DB.prepare(`SELECT "email","name" FROM "user" WHERE "id" = ?`)
    .bind(invoice.userId)
    .first();
  if (member?.email) await sendInvoiceOpened(env, member, invoice);
}

// ── Sanitizers (shared by create + update so they can't drift) ──────────────

// Items: [{description, qty, unit}] where unit is a dollar string. Returns
// normalized items + the computed totalCents, or an error.
export function sanitizeInvoice(body) {
  const b = body && typeof body === "object" ? body : {};
  const title = str(b.title, 140);
  if (!title) return { error: "Give the invoice a title" };

  const rawItems = Array.isArray(b.items) ? b.items : [];
  if (!rawItems.length) return { error: "An invoice needs at least one line item" };
  if (rawItems.length > 40) return { error: "Up to 40 line items" };

  const items = [];
  let totalCents = 0;
  for (const it of rawItems) {
    const description = str(it?.description, 300);
    if (!description) return { error: "Every line item needs a description" };
    const qty = Math.trunc(+it?.qty) || 1;
    if (qty < 1 || qty > 9999) return { error: "Line quantity must be 1–9999" };
    let unitCents;
    const unit = str(it?.unit, 16);
    if (unit) {
      if (!isUsdPrice(unit)) return { error: `"${description}": price must look like 150.00` };
      unitCents = usdToCents(unit);
    } else if (Number.isInteger(+it?.unitCents) && +it.unitCents > 0) {
      unitCents = +it.unitCents;
    } else {
      return { error: `"${description}": price must look like 150.00` };
    }
    totalCents += qty * unitCents;
    items.push({ description, qty, unitCents });
  }

  let dueDate = str(b.dueDate, 10) || null;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { error: "Due date must be YYYY-MM-DD" };
  }

  return {
    invoice: {
      title,
      notes: str(b.notes, 1000) || null,
      dueDate,
      engagementId: str(b.engagementId, 60) || null,
      items,
      totalCents,
    },
  };
}

export function sanitizeLoan(body) {
  const b = body && typeof body === "object" ? body : {};
  let principalCents;
  const principal = str(b.principal, 16);
  if (principal) {
    if (!isUsdPrice(principal)) return { error: "Principal must be a dollar amount like 500.00" };
    principalCents = usdToCents(principal);
  } else if (Number.isInteger(+b.principalCents) && +b.principalCents > 0) {
    principalCents = +b.principalCents;
  } else {
    return { error: "Principal must be a dollar amount like 500.00" };
  }

  let monthlyDueCents = null;
  const monthly = str(b.monthlyDue, 16);
  if (monthly) {
    if (!isUsdPrice(monthly)) return { error: "Monthly payment must look like 100.00" };
    monthlyDueCents = usdToCents(monthly);
  } else if (Number.isInteger(+b.monthlyDueCents) && +b.monthlyDueCents > 0) {
    monthlyDueCents = +b.monthlyDueCents;
  }

  const dueDay = Math.trunc(+b.dueDay) || 1;
  if (dueDay < 1 || dueDay > 28) return { error: "Due day must be 1–28 (so every month has one)" };

  const startDate = str(b.startDate, 10) || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: "Start date must be YYYY-MM-DD" };

  return {
    loan: {
      principalCents,
      monthlyDueCents,
      dueDay,
      startDate,
      note: str(b.note, 500) || null,
    },
  };
}

export function sanitizeEngagement(body) {
  const b = body && typeof body === "object" ? body : {};
  const name = str(b.name, 120);
  if (!name) return { error: "Give the engagement a name" };
  const status = str(b.status, 20) || "onboarding";
  if (!ENGAGEMENT_STATUSES.includes(status)) return { error: "Invalid status" };
  return {
    engagement: {
      name,
      description: str(b.description, 2000) || null,
      status,
      adminNote: str(b.adminNote, 1000) || null,
    },
  };
}

export function sanitizeRail(body) {
  const b = body && typeof body === "object" ? body : {};
  const chain = str(b.chain, 8).toUpperCase();
  if (!CHAINS.includes(chain)) return { error: "Chain must be XRP, SOL, BTC, or TON" };
  const address = str(b.address, 130);
  // Receiving address, loose shape check only — Sol pastes his own address;
  // we guard against blanks and pasted URLs, not forgeries. NEVER anything
  // that looks like key material.
  if (address.length < 20) return { error: "That doesn't look like an address" };
  if (/[\s]|^(0x)?[0-9a-f]{128,}$/i.test(address) || /private|seed|mnemonic/i.test(address)) {
    return { error: "That looks wrong — paste the PUBLIC receiving address only" };
  }
  return {
    rail: {
      chain,
      address,
      tag: str(b.tag, 60) || null,
      label: str(b.label, 60) || null,
      active: b.active === false || b.active === 0 ? 0 : 1,
    },
  };
}

// ── Shapes ──────────────────────────────────────────────────────────────────

export const publicRail = (row) => ({
  chain: row.chain,
  address: row.address,
  tag: row.tag,
  label: row.label,
});

export async function invoiceWithItems(env, invoice) {
  const { results } = await env.DB.prepare(
    `SELECT "id","description","qty","unitCents","sortOrder"
       FROM "invoice_item" WHERE "invoiceId" = ? ORDER BY "sortOrder"`
  )
    .bind(invoice.id)
    .all();
  return { ...invoice, items: results || [] };
}
