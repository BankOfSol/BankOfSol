import {
  requireAdmin,
  json,
  error,
  nowIso,
  logAdminActivity,
} from "../../../lib/util.js";
import {
  sanitizeInvoice,
  makeInvoiceRef,
  openInvoice,
  insertEntry,
  invoiceWithItems,
} from "../../../lib/ledger.js";

// POST /api/admin/members/invoice — one endpoint, three actions:
//   save  {userId, id?, title, items:[{description,qty,unit}], dueDate?, notes?, engagementId?}
//         create or edit a DRAFT (open invoices are immutable — void and
//         re-issue instead, so the ledger never disagrees with the paper).
//   open  {id}  post the ledger charge + email the member
//   void  {id}  draft: delete; open/partial-with-no-payments: reversing entry
export async function onRequestPost({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }
  const action = String(body.action || "save");
  const now = nowIso();

  if (action === "save") {
    const userId = String(body.userId || "");
    if (!userId) return error(400, "userId is required");
    const member = await env.DB.prepare(
      `SELECT 1 FROM "member_account" WHERE "userId" = ?`
    )
      .bind(userId)
      .first();
    if (!member) return error(404, "Member not found");

    const { invoice, error: msg } = sanitizeInvoice(body);
    if (msg) return error(400, msg);

    let id = body.id ? String(body.id) : null;
    if (id) {
      const existing = await env.DB.prepare(
        `SELECT "status" FROM "invoice" WHERE "id" = ? AND "userId" = ?`
      )
        .bind(id, userId)
        .first();
      if (!existing) return error(404, "Invoice not found");
      if (existing.status !== "draft") {
        return error(409, "Only drafts can be edited — void and re-issue instead");
      }
      await env.DB.prepare(
        `UPDATE "invoice" SET "title"=?, "notes"=?, "dueDate"=?, "engagementId"=?,
                "totalCents"=?, "updatedAt"=? WHERE "id"=?`
      )
        .bind(invoice.title, invoice.notes, invoice.dueDate, invoice.engagementId,
              invoice.totalCents, now, id)
        .run();
      await env.DB.prepare(`DELETE FROM "invoice_item" WHERE "invoiceId" = ?`).bind(id).run();
    } else {
      id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO "invoice"
           ("id","userId","engagementId","refCode","title","notes","status",
            "totalCents","paidCents","dueDate","createdAt","updatedAt")
         VALUES (?,?,?,?,?,?,'draft',?,0,?,?,?)`
      )
        .bind(id, userId, invoice.engagementId, makeInvoiceRef(), invoice.title,
              invoice.notes, invoice.totalCents, invoice.dueDate, now, now)
        .run();
    }

    for (let i = 0; i < invoice.items.length; i++) {
      const it = invoice.items[i];
      await env.DB.prepare(
        `INSERT INTO "invoice_item" ("id","invoiceId","description","qty","unitCents","sortOrder")
         VALUES (?,?,?,?,?,?)`
      )
        .bind(crypto.randomUUID(), id, it.description, it.qty, it.unitCents, i)
        .run();
    }

    await logAdminActivity(env, gate.user, "invoice.save", { id, totalCents: invoice.totalCents });
    const row = await env.DB.prepare(`SELECT * FROM "invoice" WHERE "id" = ?`).bind(id).first();
    return json({ ok: true, invoice: await invoiceWithItems(env, row) });
  }

  // open / void act on an existing invoice by id.
  const id = String(body.id || "");
  if (!id) return error(400, "id is required");
  const invoice = await env.DB.prepare(`SELECT * FROM "invoice" WHERE "id" = ?`)
    .bind(id)
    .first();
  if (!invoice) return error(404, "Invoice not found");

  if (action === "open") {
    if (invoice.status !== "draft") return error(409, `Can't open a ${invoice.status} invoice`);
    if (invoice.totalCents <= 0) return error(409, "Total must be positive to open");
    await openInvoice(env, invoice, gate.user.email);
    await logAdminActivity(env, gate.user, "invoice.open", {
      id,
      refCode: invoice.refCode,
      totalCents: invoice.totalCents,
    });
    return json({ ok: true, status: "open" });
  }

  if (action === "void") {
    if (invoice.status === "draft") {
      await env.DB.prepare(`DELETE FROM "invoice" WHERE "id" = ?`).bind(id).run();
      await logAdminActivity(env, gate.user, "invoice.delete-draft", { id });
      return json({ ok: true, status: "deleted" });
    }
    if (!["open", "partial"].includes(invoice.status)) {
      return error(409, `Can't void a ${invoice.status} invoice`);
    }
    if (invoice.paidCents > 0) {
      return error(409, "Payments exist — refund them first, then void");
    }
    await env.DB.prepare(
      `UPDATE "invoice" SET "status" = 'void', "updatedAt" = ? WHERE "id" = ?`
    )
      .bind(now, id)
      .run();
    // Reversing entry so the member's balance drops back — the ledger never
    // silently forgets a charge, it books the reversal.
    await insertEntry(env, {
      userId: invoice.userId,
      kind: "adjustment",
      amountCents: -invoice.totalCents,
      invoiceId: id,
      note: `Voided ${invoice.refCode}`,
      createdBy: gate.user.email,
    });
    await logAdminActivity(env, gate.user, "invoice.void", { id, refCode: invoice.refCode });
    return json({ ok: true, status: "void" });
  }

  return error(400, "action must be save, open, or void");
}
