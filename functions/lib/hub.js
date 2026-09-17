import { str, nowIso } from "./util.js";
import { isUsdPrice, usdToCents } from "./shop.js";

// Sol's command center. Shared by the superadmin routes (Sol's UI) and
// /api/ray/hub (Ray, over the shared token). Money is integer cents; the
// income log is signed (negative = expense).

export const ECO_STATUSES = ["seed", "building", "live", "paused", "closed"];
export const GOAL_STATUSES = ["active", "done", "dropped"];
export const GOAL_OWNERS = ["sol", "ray", "both"];
export const NOTE_KINDS = ["briefing", "advice", "alert", "win"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

// Constant-time check of X-Ray-Token against RAY_SHARED_TOKEN. Used by every
// /api/ray/* route.
export function rayTokenOk(env, request) {
  const want = env.RAY_SHARED_TOKEN || "";
  const given = request.headers.get("x-ray-token") || "";
  if (!want || want.length < 16) return false;
  const a = new TextEncoder().encode(want);
  const b = new TextEncoder().encode(given);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Money field: "" → null, "1,200.00" → 120000, garbage → error.
function money(v, label, { allowNegative = false } = {}) {
  const raw = str(v, 20).replace(/[$,\s]/g, "");
  if (!raw) return { cents: null };
  const neg = raw.startsWith("-");
  const mag = neg ? raw.slice(1) : raw;
  if (!isUsdPrice(mag) || (neg && !allowNegative)) return { error: `${label} must look like 1200.00` };
  return { cents: (neg ? -1 : 1) * usdToCents(mag) };
}

export function sanitizeEcosystem(body) {
  const b = body && typeof body === "object" ? body : {};
  const name = str(b.name, 60);
  if (!name) return { error: "Give it a name" };
  const status = str(b.status, 12) || "building";
  if (!ECO_STATUSES.includes(status)) return { error: "Bad status" };
  const color = str(b.color, 9);
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) return { error: "Color must be #rrggbb" };
  const target = money(b.monthlyTarget, "Monthly target");
  if (target.error) return { error: target.error };
  const url = str(b.url, 200);
  if (url && !/^https?:\/\//i.test(url)) return { error: "URL must start with http(s)://" };
  return {
    eco: {
      slug: slugify(b.slug) || slugify(name),
      name,
      tagline: str(b.tagline, 140) || null,
      status,
      color: color || "#ff6b1a",
      url: url || null,
      monthlyTargetCents: target.cents ?? 0,
      sortOrder: Number.isInteger(+b.sortOrder) ? +b.sortOrder : 0,
      notes: str(b.notes, 2000) || null,
    },
  };
}

export function sanitizeIncome(body) {
  const b = body && typeof body === "object" ? body : {};
  const ecosystemId = str(b.ecosystemId, 60);
  if (!ecosystemId) return { error: "Pick an ecosystem" };
  const amt = money(b.amount, "Amount", { allowNegative: true });
  if (amt.error) return { error: amt.error };
  if (amt.cents === null || amt.cents === 0) return { error: "Amount is required" };
  const occurredOn = str(b.occurredOn, 10) || new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(occurredOn)) return { error: "Date must be YYYY-MM-DD" };
  return {
    entry: {
      ecosystemId,
      amountCents: amt.cents,
      occurredOn,
      source: str(b.source, 60) || null,
      note: str(b.note, 300) || null,
    },
  };
}

export function sanitizeGoal(body) {
  const b = body && typeof body === "object" ? body : {};
  const title = str(b.title, 140);
  if (!title) return { error: "Give the goal a title" };
  const target = money(b.target, "Target");
  if (target.error) return { error: target.error };
  const progress = money(b.progress, "Progress");
  if (progress.error) return { error: progress.error };
  const targetDate = str(b.targetDate, 10) || null;
  if (targetDate && !DATE_RE.test(targetDate)) return { error: "Date must be YYYY-MM-DD" };
  const owner = str(b.owner, 6) || "both";
  if (!GOAL_OWNERS.includes(owner)) return { error: "Owner must be sol, ray, or both" };
  const status = str(b.status, 8) || "active";
  if (!GOAL_STATUSES.includes(status)) return { error: "Bad status" };
  let progressPct = Math.trunc(+b.progressPct);
  if (!Number.isFinite(progressPct)) progressPct = 0;
  progressPct = Math.min(100, Math.max(0, progressPct));
  return {
    goal: {
      ecosystemId: str(b.ecosystemId, 60) || null,
      title,
      detail: str(b.detail, 2000) || null,
      targetCents: target.cents,
      progressCents: progress.cents ?? 0,
      progressPct,
      targetDate,
      owner,
      status,
    },
  };
}

// ── The summary both Sol's UI and Ray read ───────────────────────────────────

export async function hubSummary(env, { forRay = false } = {}) {
  const today = new Date();
  const monthStart = today.toISOString().slice(0, 8) + "01";
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const nowIsoStr = nowIso();
  const dayAgo = new Date(Date.now() - 86400000).toISOString();

  const count = (sql, ...binds) =>
    env.DB.prepare(sql).bind(...binds).first().then((r) => r?.n ?? 0).catch(() => 0);

  const [ecos, goals, notes, income, metrics, stats] = await Promise.all([
    env.DB.prepare(
      `SELECT e.*,
              COALESCE((SELECT SUM("amountCents") FROM "income_entry" i WHERE i."ecosystemId" = e."id" AND i."occurredOn" >= ?),0) AS "monthCents",
              COALESCE((SELECT SUM("amountCents") FROM "income_entry" i WHERE i."ecosystemId" = e."id" AND i."occurredOn" >= ?),0) AS "last30Cents",
              COALESCE((SELECT SUM("amountCents") FROM "income_entry" i WHERE i."ecosystemId" = e."id"),0) AS "lifetimeCents",
              (SELECT MAX("occurredOn") FROM "income_entry" i WHERE i."ecosystemId" = e."id") AS "lastIncomeOn",
              (SELECT COUNT(*) FROM "goal" g WHERE g."ecosystemId" = e."id" AND g."status" = 'active') AS "activeGoals"
         FROM "ecosystem" e ORDER BY e."sortOrder", e."createdAt"`
    )
      .bind(monthStart, d30)
      .all(),
    env.DB.prepare(
      `SELECT g.*, e."name" AS "ecosystemName", e."slug" AS "ecosystemSlug" FROM "goal" g
         LEFT JOIN "ecosystem" e ON e."id" = g."ecosystemId"
        ORDER BY CASE g."status" WHEN 'active' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
                 g."targetDate" IS NULL, g."targetDate", g."createdAt" DESC LIMIT 100`
    ).all(),
    env.DB.prepare(
      `SELECT n.*, e."name" AS "ecosystemName", g."title" AS "goalTitle" FROM "ray_note" n
         LEFT JOIN "ecosystem" e ON e."id" = n."ecosystemId"
         LEFT JOIN "goal" g ON g."id" = n."goalId"
        WHERE n."dismissedAt" IS NULL
        ORDER BY n."readAt" IS NOT NULL, n."createdAt" DESC LIMIT ${forRay ? 8 : 60}`
    ).all(),
    forRay
      ? Promise.resolve({ results: [] })
      : env.DB.prepare(
          `SELECT i.*, e."name" AS "ecosystemName", e."color" FROM "income_entry" i
             JOIN "ecosystem" e ON e."id" = i."ecosystemId"
            ORDER BY i."occurredOn" DESC, i."createdAt" DESC LIMIT 60`
        ).all(),
    env.DB.prepare(
      `SELECT m.*, e."slug" AS "ecosystemSlug", e."name" AS "ecosystemName" FROM "hub_metric" m
         LEFT JOIN "ecosystem" e ON e."id" = m."ecosystemId"
        ORDER BY m."source", m."key"`
    ).all().catch(() => ({ results: [] })),
    Promise.all([
      count(`SELECT COUNT(*) AS n FROM "member_account" WHERE "status" = 'approved'`),
      count(`SELECT COUNT(*) AS n FROM "member_account" WHERE "status" = 'applied'`),
      count(`SELECT COUNT(*) AS n FROM "waitlist" WHERE "status" = 'new'`),
      count(`SELECT COUNT(*) AS n FROM "receipt" WHERE "status" IN ('queued','scanning')`),
      count(`SELECT COUNT(*) AS n FROM "reimbursement" WHERE "status" = 'submitted'`),
      count(`SELECT COUNT(*) AS n FROM "reimbursement" WHERE "status" = 'approved'`),
      count(`SELECT COALESCE(SUM("amountCents"),0) AS n FROM "reimbursement" WHERE "status" IN ('submitted','approved')`),
      count(`SELECT COALESCE(SUM(b),0) AS n FROM (SELECT SUM("amountCents") AS b FROM "ledger_entry" GROUP BY "userId" HAVING b > 0)`),
      count(`SELECT COALESCE(-SUM(b),0) AS n FROM (SELECT SUM("amountCents") AS b FROM "ledger_entry" GROUP BY "userId" HAVING b < 0)`),
      count(`SELECT COUNT(*) AS n FROM "email_log" WHERE "ok" = 0 AND "createdAt" > ?`, dayAgo),
      count(`SELECT COUNT(*) AS n FROM "ray_note" WHERE "kind" = 'briefing' AND "createdAt" > ?`, today.toISOString().slice(0, 10)),
    ]).then(
      ([members, applied, waitlistNew, receiptsScanning, reimbSubmitted, reimbApproved, reimbOpenCents, owedToSolCents, solOwesCents, emailFailures24h, briefingsToday]) => ({
        members,
        applied,
        waitlistNew,
        receiptsScanning,
        reimbSubmitted,
        reimbApproved,
        reimbOpenCents,
        owedToSolCents,
        solOwesCents,
        emailFailures24h,
        briefingsToday,
      })
    ),
  ]);

  const ecosystems = ecos.results || [];
  const totals = ecosystems.reduce(
    (t, e) => ({
      monthCents: t.monthCents + e.monthCents,
      last30Cents: t.last30Cents + e.last30Cents,
      lifetimeCents: t.lifetimeCents + e.lifetimeCents,
      targetCents: t.targetCents + e.monthlyTargetCents,
    }),
    { monthCents: 0, last30Cents: 0, lifetimeCents: 0, targetCents: 0 }
  );

  return {
    asOf: nowIsoStr,
    ecosystems,
    totals,
    goals: goals.results || [],
    notes: notes.results || [],
    income: income.results || [],
    metrics: (metrics.results || []).map((m) => ({ ...m, detail: safeJson(m.detailJson), detailJson: undefined })),
    stats,
  };
}

function safeJson(s) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ── Imports from Ray (idempotent) ────────────────────────────────────────────

// Income keyed by (source, externalId): a re-sync updates the row in place.
// Returns 'inserted' | 'updated' | 'skipped'.
export async function importIncome(env, bySlug, row, createdBy = "ray") {
  const ecosystemId = bySlug[str(row?.ecosystemSlug, 40)];
  const source = str(row?.source, 30);
  const externalId = str(row?.externalId, 120);
  const amountCents = Math.trunc(+row?.amountCents);
  const occurredOn = str(row?.occurredOn, 10);
  if (!ecosystemId || !source || !externalId || !Number.isFinite(amountCents) || amountCents === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    return "skipped";
  }
  const note = str(row?.note, 300) || null;
  const existing = await env.DB.prepare(
    `SELECT "id" FROM "income_entry" WHERE "source" = ? AND "externalId" = ?`
  )
    .bind(source, externalId)
    .first();
  const now = nowIso();
  if (existing) {
    await env.DB.prepare(
      `UPDATE "income_entry" SET "ecosystemId" = ?, "amountCents" = ?, "occurredOn" = ?, "note" = ? WHERE "id" = ?`
    )
      .bind(ecosystemId, amountCents, occurredOn, note, existing.id)
      .run();
    return "updated";
  }
  await env.DB.prepare(
    `INSERT INTO "income_entry" ("id","ecosystemId","amountCents","occurredOn","source","externalId","note","createdBy","createdAt")
     VALUES (?,?,?,?,?,?,?,?,?)`
  )
    .bind(crypto.randomUUID(), ecosystemId, amountCents, occurredOn, source, externalId, note, createdBy, now)
    .run();
  return "inserted";
}

// Latest value per (source, key).
export async function upsertMetric(env, bySlug, m) {
  const source = str(m?.source, 30);
  const key = str(m?.key, 80);
  const label = str(m?.label, 80) || key;
  const value = +m?.value;
  if (!source || !key || !Number.isFinite(value)) return false;
  const ecosystemId = bySlug[str(m?.ecosystemSlug, 40)] || null;
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO "hub_metric" ("id","source","key","label","value","unit","ecosystemId","detailJson","asOf","updatedAt")
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT("source","key") DO UPDATE SET
       "label" = excluded."label", "value" = excluded."value", "unit" = excluded."unit",
       "ecosystemId" = excluded."ecosystemId", "detailJson" = excluded."detailJson",
       "asOf" = excluded."asOf", "updatedAt" = excluded."updatedAt"`
  )
    .bind(
      crypto.randomUUID(), source, key, label, value, str(m?.unit, 12) || null, ecosystemId,
      m?.detail && typeof m.detail === "object" ? JSON.stringify(m.detail).slice(0, 4000) : null,
      str(m?.asOf, 30) || now, now
    )
    .run();
  return true;
}
