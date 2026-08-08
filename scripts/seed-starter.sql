-- Starter content — the sample items the site launches with (kept in the
-- final version on purpose). Idempotent: every insert is guarded by its
-- natural key, so running this twice (or after the same items were created
-- by hand) adds nothing.
--
-- Run AFTER the admin account exists (the shop row resolves its owner via
-- ADMIN_EMAIL's user row; if that user doesn't exist yet, the shop/product
-- inserts simply do nothing — run it again after signup).
--
--   npm run db:seed           # local D1
--   npm run db:seed:remote    # production D1
--
-- ⚠️ One statement at a time if remote --file ever errors (see PoundPlay's
-- migration war stories).

-- ── Weekly availability: Mon–Fri, 10:00–16:00 (America/Los_Angeles) ────────
INSERT INTO "availability_rule" ("id","weekday","startTime","endTime","active","createdAt","updatedAt")
SELECT 'seed-rule-mon', 1, '10:00', '16:00', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM "availability_rule" WHERE "weekday" = 1 AND "startTime" = '10:00' AND "endTime" = '16:00');

INSERT INTO "availability_rule" ("id","weekday","startTime","endTime","active","createdAt","updatedAt")
SELECT 'seed-rule-tue', 2, '10:00', '16:00', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM "availability_rule" WHERE "weekday" = 2 AND "startTime" = '10:00' AND "endTime" = '16:00');

INSERT INTO "availability_rule" ("id","weekday","startTime","endTime","active","createdAt","updatedAt")
SELECT 'seed-rule-wed', 3, '10:00', '16:00', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM "availability_rule" WHERE "weekday" = 3 AND "startTime" = '10:00' AND "endTime" = '16:00');

INSERT INTO "availability_rule" ("id","weekday","startTime","endTime","active","createdAt","updatedAt")
SELECT 'seed-rule-thu', 4, '10:00', '16:00', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM "availability_rule" WHERE "weekday" = 4 AND "startTime" = '10:00' AND "endTime" = '16:00');

INSERT INTO "availability_rule" ("id","weekday","startTime","endTime","active","createdAt","updatedAt")
SELECT 'seed-rule-fri', 5, '10:00', '16:00', 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM "availability_rule" WHERE "weekday" = 5 AND "startTime" = '10:00' AND "endTime" = '16:00');

-- ── Consulting services ────────────────────────────────────────────────────
INSERT INTO "consult_service"
  ("id","slug","name","description","durationMin","priceCents","slotEveryMin","bufferMin","leadHours","maxDaysAhead","active","sortOrder","createdAt","updatedAt")
SELECT 'seed-svc-intro-call', 'intro-call', 'Intro call',
       '30 minutes to scope your project — website, app, or automation. Credited toward the build if we go ahead.',
       30, 5000, 30, 15, 12, 30, 1, 0, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM "consult_service" WHERE "slug" = 'intro-call');

INSERT INTO "consult_service"
  ("id","slug","name","description","durationMin","priceCents","slotEveryMin","bufferMin","leadHours","maxDaysAhead","active","sortOrder","createdAt","updatedAt")
SELECT 'seed-svc-working-session', 'working-session', 'Working session',
       '60 minutes of hands-on build time with Sol: web dev, app dev, or business financial automation.',
       60, 15000, 30, 15, 12, 30, 1, 1, datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM "consult_service" WHERE "slug" = 'working-session');

-- ── The shop + first product ───────────────────────────────────────────────
-- Owner resolves to the ADMIN_EMAIL account; inserts nothing until that user
-- exists (sign up first, then re-run).
INSERT INTO "shop" ("id","ownerUserId","name","blurb","logoUrl","status","createdAt","updatedAt")
SELECT 'seed-shop-bankofsol', u."id", 'Bank of Sol Shop',
       'Goods from the vault — made to order, shipped to you.',
       NULL, 'active', datetime('now'), datetime('now')
  FROM "user" u
 WHERE u."email" = 'kaasi_s@icloud.com'
   AND NOT EXISTS (SELECT 1 FROM "shop");

INSERT INTO "product"
  ("id","shopId","name","description","priceCents","images","modelUrl","modelKind","colors","status","sortOrder","createdAt","updatedAt")
SELECT 'seed-product-sun-stand', s."id", 'Sol Sun Desk Stand',
       '3D-printed phone & card stand with the Bank of Sol sun mark. Made to order.',
       2400, '[]', NULL, NULL,
       '[{"name":"Vault Black","hex":"#0b0e11"},{"name":"Sun Gold","hex":"#f0b90b"}]',
       'published', 1, datetime('now'), datetime('now')
  FROM "shop" s
 WHERE NOT EXISTS (SELECT 1 FROM "product" WHERE "name" = 'Sol Sun Desk Stand')
 LIMIT 1;
