import { requireMember, json, error, nowIso } from "../../lib/util.js";
import { cloudScan, applyScan, receiptShape, CLOUD_MODEL } from "../../lib/reimburse.js";

// POST /api/reimbursements/rescan {id, where:'cloud'|'ray'} — retry a scan.
// 'ray' just puts the receipt back in the queue for Ray's poller; 'cloud'
// runs Workers AI right now (when the deployment has the AI binding).
export async function onRequestPost({ request, env }) {
  const gate = await requireMember(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }
  const id = String(body.id || "");
  const where = body.where === "cloud" ? "cloud" : "ray";

  const row = await env.DB.prepare(`SELECT * FROM "receipt" WHERE "id" = ? AND "userId" = ?`)
    .bind(id, gate.user.id)
    .first();
  if (!row) return error(404, "Receipt not found");
  if (row.status === "scanning" && row.scanStartedAt && Date.now() - Date.parse(row.scanStartedAt) < 3 * 60 * 1000) {
    return error(409, "A scan is already running on this receipt");
  }

  if (where === "cloud") {
    if (!env.AI) return error(503, "Cloud scanning isn't enabled on this deployment");
    const result = await cloudScan(env, row);
    await applyScan(env, row, result, `workers-ai:${CLOUD_MODEL}`);
  } else {
    await env.DB.prepare(
      `UPDATE "receipt" SET "status" = 'queued', "scanError" = NULL, "scanStartedAt" = NULL, "updatedAt" = ?
        WHERE "id" = ?`
    )
      .bind(nowIso(), id)
      .run();
  }

  const fresh = await env.DB.prepare(`SELECT * FROM "receipt" WHERE "id" = ?`).bind(id).first();
  return json({ receipt: receiptShape(fresh) });
}
