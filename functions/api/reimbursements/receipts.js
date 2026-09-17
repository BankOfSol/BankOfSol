import { requireMember, json, error, nowIso } from "../../lib/util.js";
import { sanitizeReceiptEdit, receiptShape, cloudScan, applyScan, CLOUD_MODEL } from "../../lib/reimburse.js";

// Receipt photos. Same R2 conventions as /api/upload (uuid key, served back
// through /api/files/<key>) but with a row in `receipt` so the scan queue
// can pick it up. Members only; every row is owner-scoped (404, not 403).
//
//   POST   multipart {file}            → 201 {receipt}   (queued for scanning)
//   PATCH  {id, merchant?, purchaseDate?, total?, note?} → {receipt}
//   DELETE ?id=                        → {ok}            (loose receipts only)

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };

export async function onRequestPost({ request, env }) {
  const gate = await requireMember(env, request);
  if (gate.error) return gate.error;

  let form;
  try {
    form = await request.formData();
  } catch {
    return error(400, "Expected multipart/form-data");
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return error(400, "No photo uploaded");
  if (!ALLOWED.includes(file.type)) return error(400, "Use a JPG, PNG, WEBP, or HEIC photo");
  if (file.size === 0) return error(400, "That file is empty");
  if (file.size > MAX_BYTES) return error(400, "Photo must be under 25 MB");

  const key = `${crypto.randomUUID()}.${EXT[file.type] || "bin"}`;
  await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

  const now = nowIso();
  const receipt = {
    id: crypto.randomUUID(),
    userId: gate.user.id,
    fileUrl: `/api/files/${key}`,
    contentType: file.type,
  };
  await env.DB.prepare(
    `INSERT INTO "receipt" ("id","userId","fileUrl","contentType","status","createdAt","updatedAt")
     VALUES (?,?,?,?,'queued',?,?)`
  )
    .bind(receipt.id, receipt.userId, receipt.fileUrl, receipt.contentType, now, now)
    .run();

  // Cloud mode scans inline; the default (ray) leaves it queued for Ray's
  // poller on Sol's Mac (functions/api/ray/receipts.js).
  if (env.RECEIPT_SCAN_MODE === "cloud" && env.AI) {
    const result = await cloudScan(env, receipt);
    await applyScan(env, receipt, result, `workers-ai:${CLOUD_MODEL}`);
  }

  const row = await env.DB.prepare(`SELECT * FROM "receipt" WHERE "id" = ?`).bind(receipt.id).first();
  return json({ receipt: receiptShape(row) }, { status: 201 });
}

export async function onRequestPatch({ request, env }) {
  const gate = await requireMember(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }
  const id = String(body.id || "");
  const row = await env.DB.prepare(`SELECT * FROM "receipt" WHERE "id" = ? AND "userId" = ?`)
    .bind(id, gate.user.id)
    .first();
  if (!row) return error(404, "Receipt not found");
  if (row.reimbursementId) {
    const req = await env.DB.prepare(`SELECT "status" FROM "reimbursement" WHERE "id" = ?`)
      .bind(row.reimbursementId)
      .first();
    if (req && req.status !== "submitted") return error(409, "This receipt is on a decided request");
  }

  const s = sanitizeReceiptEdit(body);
  if (s.error) return error(400, s.error);
  const sets = Object.keys(s.edit).map((k) => `"${k}" = ?`);
  await env.DB.prepare(
    `UPDATE "receipt" SET ${sets.join(", ")}, "updatedAt" = ? WHERE "id" = ?`
  )
    .bind(...Object.values(s.edit), nowIso(), id)
    .run();

  // A request's total follows its receipts while it's still submitted.
  if (row.reimbursementId && "totalCents" in s.edit) {
    await env.DB.prepare(
      `UPDATE "reimbursement" SET "totalCents" = (
          SELECT COALESCE(SUM("totalCents"),0) FROM "receipt" WHERE "reimbursementId" = ?),
          "updatedAt" = ?
        WHERE "id" = ? AND "status" = 'submitted'`
    )
      .bind(row.reimbursementId, nowIso(), row.reimbursementId)
      .run();
  }

  const fresh = await env.DB.prepare(`SELECT * FROM "receipt" WHERE "id" = ?`).bind(id).first();
  return json({ receipt: receiptShape(fresh) });
}

export async function onRequestDelete({ request, env }) {
  const gate = await requireMember(env, request);
  if (gate.error) return gate.error;
  const id = new URL(request.url).searchParams.get("id") || "";
  const row = await env.DB.prepare(`SELECT * FROM "receipt" WHERE "id" = ? AND "userId" = ?`)
    .bind(id, gate.user.id)
    .first();
  if (!row) return error(404, "Receipt not found");
  if (row.reimbursementId) return error(409, "Receipts on a request can't be deleted");
  await env.DB.prepare(`DELETE FROM "receipt" WHERE "id" = ?`).bind(id).run();
  // Best-effort: the R2 object goes too (the key is the URL's tail).
  try {
    await env.BUCKET.delete(row.fileUrl.replace(/^\/api\/files\//, ""));
  } catch {
    /* an orphaned object is harmless */
  }
  return json({ ok: true });
}
