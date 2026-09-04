-- Sol & Ray pilot requests. The Sol & Ray landing page (/sol-and-ray, and the
-- solandray.com host once that zone is attached) is a lead-capture surface for
-- a separate product line: an AI assistant that runs reference checks for
-- school-district hiring offices. Leads are plain rows — no auth, no money —
-- reviewed from Admin → Sol & Ray leads. `ip` exists only for the per-IP spam
-- cap on the public endpoint.

CREATE TABLE IF NOT EXISTS "solray_lead" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "title"     TEXT,                    -- job title, in their words
  "org"       TEXT NOT NULL,           -- district / agency
  "email"     TEXT NOT NULL,
  "phone"     TEXT,
  "volume"    TEXT,                    -- rough size of the reference-check load
  "message"   TEXT,
  "source"    TEXT,                    -- host + path the form was submitted from
  "ip"        TEXT,
  "status"    TEXT NOT NULL DEFAULT 'new'
                CHECK ("status" IN ('new','contacted','pilot','closed')),
  "adminNote" TEXT,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_solray_lead_status" ON "solray_lead"("status","createdAt");
CREATE INDEX IF NOT EXISTS "idx_solray_lead_ip" ON "solray_lead"("ip","createdAt");
