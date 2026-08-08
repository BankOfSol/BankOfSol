import {
  requireAdmin,
  json,
  error,
  nowIso,
  str,
  logAdminActivity,
} from "../../../lib/util.js";
import { isUsdPrice, usdToCents } from "../../../lib/shop.js";
import {
  sanitizeLoan,
  makeLoanRef,
  insertEntry,
  LOAN_STATUSES,
  balanceFor,
} from "../../../lib/ledger.js";

// POST /api/admin/members/loan — three actions:
//   create  {userId, principal:"500.00", monthlyDue?, dueDay?, startDate?, note?}
//           books the disbursement (+principal on the member's ledger); the
//           daily cron then tracks it monthly (loan_due marker + emails).
//   payment {id, amount:"100.00", method?, reference?}
//           books a loan_payment (−amount); flips the loan to 'paid' when the
//           payments cover the principal.
//   status  {id, status}  (closed/defaulted/forgiven — forgiven books a
//           reversing adjustment for whatever is still outstanding)
export async function onRequestPost({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }
  const action = String(body.action || "create");
  const now = nowIso();

  if (action === "create") {
    const userId = String(body.userId || "");
    if (!userId) return error(400, "userId is required");
    const member = await env.DB.prepare(`SELECT 1 FROM "member_account" WHERE "userId" = ?`)
      .bind(userId)
      .first();
    if (!member) return error(404, "Member not found");

    const { loan, error: msg } = sanitizeLoan(body);
    if (msg) return error(400, msg);

    const id = crypto.randomUUID();
    const refCode = makeLoanRef();
    await env.DB.prepare(
      `INSERT INTO "loan"
         ("id","userId","refCode","principalCents","monthlyDueCents","dueDay",
          "status","startDate","note","createdAt","updatedAt")
       VALUES (?,?,?,?,?,?,'active',?,?,?,?)`
    )
      .bind(id, userId, refCode, loan.principalCents, loan.monthlyDueCents,
            loan.dueDay, loan.startDate, loan.note, now, now)
      .run();

    await insertEntry(env, {
      userId,
      kind: "loan_disbursement",
      amountCents: loan.principalCents,
      loanId: id,
      note: `${refCode} disbursed`,
      createdBy: gate.user.email,
      entryDate: `${loan.startDate}T00:00:00.000Z`,
    });

    await logAdminActivity(env, gate.user, "loan.create", {
      id,
      refCode,
      userId,
      principalCents: loan.principalCents,
    });
    const row = await env.DB.prepare(`SELECT * FROM "loan" WHERE "id" = ?`).bind(id).first();
    return json({ ok: true, loan: row }, { status: 201 });
  }

  const id = String(body.id || "");
  if (!id) return error(400, "id is required");
  const loan = await env.DB.prepare(`SELECT * FROM "loan" WHERE "id" = ?`).bind(id).first();
  if (!loan) return error(404, "Loan not found");

  // Sum of loan_payment entries (they're negative) against this loan.
  const repaid = async () => {
    const row = await env.DB.prepare(
      `SELECT COALESCE(-SUM("amountCents"), 0) AS n FROM "ledger_entry"
        WHERE "loanId" = ? AND "kind" = 'loan_payment'`
    )
      .bind(id)
      .first();
    return row?.n ?? 0;
  };

  if (action === "payment") {
    if (loan.status !== "active") return error(409, `This loan is ${loan.status}`);
    const amount = str(body.amount, 16);
    if (!isUsdPrice(amount)) return error(400, "Amount must be a dollar amount like 100.00");
    const amountCents = usdToCents(amount);

    await insertEntry(env, {
      userId: loan.userId,
      kind: "loan_payment",
      amountCents: -amountCents,
      method: str(body.method, 12) || "other",
      reference: str(body.reference, 200) || null,
      loanId: id,
      note: `Payment on ${loan.refCode}`,
      createdBy: gate.user.email,
    });

    const totalRepaid = await repaid();
    let status = loan.status;
    if (totalRepaid >= loan.principalCents) {
      status = "paid";
      await env.DB.prepare(
        `UPDATE "loan" SET "status" = 'paid', "updatedAt" = ? WHERE "id" = ?`
      )
        .bind(now, id)
        .run();
    }
    await logAdminActivity(env, gate.user, "loan.payment", { id, refCode: loan.refCode, amountCents });
    return json({
      ok: true,
      status,
      repaidCents: totalRepaid,
      balance: await balanceFor(env, loan.userId),
    });
  }

  if (action === "status") {
    const status = str(body.status, 12);
    if (!LOAN_STATUSES.includes(status)) return error(400, "Invalid loan status");
    if (loan.status === status) return json({ ok: true, status });

    // Forgiving a loan books the outstanding remainder off the member's
    // balance — the ledger shows the gift instead of quietly shrinking.
    if (status === "forgiven") {
      const outstanding = loan.principalCents - (await repaid());
      if (outstanding > 0) {
        await insertEntry(env, {
          userId: loan.userId,
          kind: "adjustment",
          amountCents: -outstanding,
          loanId: id,
          note: `${loan.refCode} forgiven`,
          createdBy: gate.user.email,
        });
      }
    }

    await env.DB.prepare(`UPDATE "loan" SET "status" = ?, "updatedAt" = ? WHERE "id" = ?`)
      .bind(status, now, id)
      .run();
    await logAdminActivity(env, gate.user, "loan.status", { id, refCode: loan.refCode, status });
    return json({ ok: true, status });
  }

  return error(400, "action must be create, payment, or status");
}
