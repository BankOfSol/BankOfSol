-- Consulting bookings: sell Sol's time. Weekly availability rules (wall-clock
-- America/Los_Angeles) + date exceptions; slots are COMPUTED on request, never
-- materialized — a booking row is only born at checkout, and payment confirms
-- it. Pattern morphed from PoundPlay's volunteer scheduling.

CREATE TABLE IF NOT EXISTS "consult_service" (
  "id"           TEXT PRIMARY KEY,
  "slug"         TEXT NOT NULL UNIQUE,          -- 'website-dev'
  "name"         TEXT NOT NULL,
  "description"  TEXT,
  "durationMin"  INTEGER NOT NULL,              -- meeting length
  "priceCents"   INTEGER NOT NULL,
  "slotEveryMin" INTEGER NOT NULL DEFAULT 30,   -- slot grid step
  "bufferMin"    INTEGER NOT NULL DEFAULT 15,   -- breathing room between meetings
  "leadHours"    INTEGER NOT NULL DEFAULT 12,   -- min notice before a slot
  "maxDaysAhead" INTEGER NOT NULL DEFAULT 30,   -- booking horizon
  "active"       INTEGER NOT NULL DEFAULT 1,
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TEXT NOT NULL,
  "updatedAt"    TEXT NOT NULL
);

-- Weekly recurring windows, wall-clock in America/Los_Angeles.
CREATE TABLE IF NOT EXISTS "availability_rule" (
  "id"        TEXT PRIMARY KEY,
  "weekday"   INTEGER NOT NULL CHECK ("weekday" BETWEEN 0 AND 6),  -- 0=Sunday
  "startTime" TEXT NOT NULL,                     -- 'HH:MM'
  "endTime"   TEXT NOT NULL,
  "active"    INTEGER NOT NULL DEFAULT 1,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL
);

-- Date-specific overrides: 'closed' blacks out a whole day; 'open' adds a
-- one-off extra window (times required).
CREATE TABLE IF NOT EXISTS "availability_exception" (
  "id"        TEXT PRIMARY KEY,
  "date"      TEXT NOT NULL,                     -- 'YYYY-MM-DD' (LA calendar date)
  "kind"      TEXT NOT NULL CHECK ("kind" IN ('closed','open')),
  "startTime" TEXT,                              -- open only
  "endTime"   TEXT,
  "note"      TEXT,
  "createdAt" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_avail_exc_date" ON "availability_exception"("date");

-- Guest-capable bookings. startAt/endAt are UTC ISO instants of the MEETING
-- (buffer is not stored — it's applied during overlap checks). buyerEmail/
-- buyerName are Stripe's snapshot for guests; icsToken is the unguessable key
-- to the calendar file + cancel link.
CREATE TABLE IF NOT EXISTS "booking" (
  "id"              TEXT PRIMARY KEY,
  "serviceId"       TEXT NOT NULL REFERENCES "consult_service"("id"),
  "userId"          TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "buyerEmail"      TEXT,
  "buyerName"       TEXT,
  "buyerTz"         TEXT,                        -- IANA tz for email rendering
  "buyerIp"         TEXT,
  "refCode"         TEXT NOT NULL UNIQUE,
  "icsToken"        TEXT NOT NULL UNIQUE,
  "serviceName"     TEXT NOT NULL,               -- snapshot
  "startAt"         TEXT NOT NULL,               -- UTC ISO
  "endAt"           TEXT NOT NULL,
  "priceCents"      INTEGER NOT NULL,
  "note"            TEXT,
  "meetingUrl"      TEXT,
  "stripeSessionId" TEXT,
  "reminderSentAt"  TEXT,
  "status"          TEXT NOT NULL DEFAULT 'pending'
                      CHECK ("status" IN ('pending','paid','completed',
                                          'cancelled','refunded','expired')),
  "createdAt"       TEXT NOT NULL,
  "updatedAt"       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_booking_time" ON "booking"("startAt","status");
CREATE INDEX IF NOT EXISTS "idx_booking_session" ON "booking"("stripeSessionId");
CREATE INDEX IF NOT EXISTS "idx_booking_user" ON "booking"("userId","createdAt");
