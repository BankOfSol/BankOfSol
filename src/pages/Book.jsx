import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { fmtUsd } from "../lib/money.js";
import usePageMeta from "../lib/usePageMeta.js";

// Visitor's own timezone — slots are bare UTC instants from the API and are
// rendered here, so a client in Berlin books "18:00" their time and the
// server still stores the exact instant.
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
const DAYS_SHOWN = 14;

const dayKey = (iso) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));

const fmtTime = (iso) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

const fmtDayChip = (date) => ({
  dow: new Intl.DateTimeFormat(undefined, { timeZone: TZ, weekday: "short" }).format(date),
  dom: new Intl.DateTimeFormat(undefined, { timeZone: TZ, day: "numeric" }).format(date),
  month: new Intl.DateTimeFormat(undefined, { timeZone: TZ, month: "short" }).format(date),
});

export default function Book() {
  usePageMeta({ title: "Book Time" });
  const [services, setServices] = useState(null);
  const [service, setService] = useState(null);
  const [slots, setSlots] = useState(null);
  const [day, setDay] = useState(null); // local date key 'YYYY-MM-DD'
  const [picked, setPicked] = useState(null); // slot {startAt, endAt}
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .bookingServices()
      .then((d) => setServices(d.services || []))
      .catch(() => setServices([]));
  }, []);

  // The next DAYS_SHOWN calendar days in the visitor's zone.
  const days = useMemo(() => {
    const out = [];
    for (let i = 0; i < DAYS_SHOWN; i++) {
      const d = new Date(Date.now() + i * 86400000);
      out.push({ key: dayKey(d.toISOString()), date: d });
    }
    return out;
  }, []);

  // Slots for the whole visible range in one call. from/to are LA dates on
  // the server; pad a day each side so visitor-local grouping never misses an
  // edge slot.
  async function loadSlots(svc) {
    setSlots(null);
    setPicked(null);
    const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + (DAYS_SHOWN + 1) * 86400000).toISOString().slice(0, 10);
    try {
      const d = await api.bookingSlots(svc.id, from, to);
      setSlots(d.slots || []);
    } catch {
      setSlots([]);
    }
  }

  function chooseService(svc) {
    setService(svc);
    setDay(null);
    setErr("");
    loadSlots(svc);
  }

  const slotsByDay = useMemo(() => {
    const map = {};
    for (const s of slots || []) {
      const k = dayKey(s.startAt);
      (map[k] = map[k] || []).push(s);
    }
    return map;
  }, [slots]);

  // First day that actually has slots becomes the default selection.
  useEffect(() => {
    if (slots && !day) {
      const first = days.find((d) => (slotsByDay[d.key] || []).length);
      if (first) setDay(first.key);
    }
  }, [slots, day, days, slotsByDay]);

  async function pay() {
    if (!picked || !service) return;
    setErr("");
    setBusy(true);
    try {
      const res = await api.bookingCheckout({
        serviceId: service.id,
        startAt: picked.startAt,
        buyerTz: TZ,
        note: note.trim() || undefined,
      });
      window.location.assign(res.url);
    } catch (e) {
      setBusy(false);
      setErr(e.message || "Could not start checkout");
      if (e.status === 409) {
        // Slot got taken while they were deciding — refresh the board.
        setPicked(null);
        loadSlots(service);
      }
    }
  }

  if (services === null) return <div className="spinner">Loading…</div>;

  return (
    <div className="page">
      <h1>Book time with Sol</h1>
      <p className="muted" style={{ maxWidth: 620 }}>
        Pick a service, then a time. Payment confirms the slot instantly.
        Cancel 24 hours or more before the session for a full refund.
      </p>

      {!services.length && (
        <div className="empty">
          Booking opens soon — services are being set up. Check back shortly.
        </div>
      )}

      <div className="pillars" style={{ marginTop: 18 }}>
        {services.map((s) => (
          <button
            key={s.id}
            className={`card pillar`}
            style={{
              cursor: "pointer",
              textAlign: "left",
              borderColor: service?.id === s.id ? "var(--gold)" : undefined,
              font: "inherit",
              color: "inherit",
            }}
            onClick={() => chooseService(s)}
          >
            <h3>{s.name}</h3>
            <p>{s.description}</p>
            <div className="row" style={{ marginTop: "auto" }}>
              <span className="badge badge-gold">{s.durationMin} min</span>
              <span className="product-price">{fmtUsd(s.priceCents)}</span>
            </div>
          </button>
        ))}
      </div>

      {service && (
        <div className="panel" style={{ marginTop: 24 }}>
          <div className="spread">
            <h2 style={{ margin: 0 }}>{service.name}</h2>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              Times shown in {TZ.replace(/_/g, " ")}
            </span>
          </div>

          {slots === null ? (
            <div className="spinner">Finding open times…</div>
          ) : !slots.length ? (
            <div className="empty" style={{ marginTop: 14 }}>
              No open times in the next two weeks — check back after the
              calendar refreshes.
            </div>
          ) : (
            <>
              <div className="day-strip" style={{ marginTop: 14 }}>
                {days.map((d) => {
                  const n = (slotsByDay[d.key] || []).length;
                  const chip = fmtDayChip(d.date);
                  return (
                    <button
                      key={d.key}
                      className={`day-chip${day === d.key ? " active" : ""}`}
                      disabled={!n}
                      onClick={() => {
                        setDay(d.key);
                        setPicked(null);
                      }}
                    >
                      <span className="dow">{chip.dow}</span>
                      <span className="dom">{chip.dom}</span>
                      <span className="dow">{chip.month}</span>
                    </button>
                  );
                })}
              </div>

              <div className="slot-grid">
                {(slotsByDay[day] || []).map((s) => (
                  <button
                    key={s.startAt}
                    className={`slot${picked?.startAt === s.startAt ? " active" : ""}`}
                    onClick={() => setPicked(s)}
                  >
                    {fmtTime(s.startAt)}
                  </button>
                ))}
              </div>
            </>
          )}

          {picked && (
            <div className="card card-raised" style={{ marginTop: 18 }}>
              <div className="kv">
                <span className="k">Session</span>
                <span className="v">{service.name}</span>
              </div>
              <div className="kv">
                <span className="k">When</span>
                <span className="v">
                  {new Intl.DateTimeFormat(undefined, {
                    timeZone: TZ,
                    dateStyle: "full",
                    timeStyle: "short",
                  }).format(new Date(picked.startAt))}
                </span>
              </div>
              <div className="kv">
                <span className="k">Price</span>
                <span className="v green">{fmtUsd(service.priceCents)}</span>
              </div>
              <div className="form-field" style={{ marginTop: 10 }}>
                <label htmlFor="note">What should we dig into? (optional)</label>
                <textarea
                  id="note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="A sentence or two about your project"
                />
              </div>
              {err && <div className="form-result error">{err}</div>}
              <button className="btn btn-green btn-block" disabled={busy} onClick={pay}>
                {busy ? "Starting checkout…" : `Pay ${fmtUsd(service.priceCents)} & book`}
              </button>
              <p className="hint" style={{ textAlign: "center" }}>
                Payment by card via Stripe. Full refund if you cancel ≥24h out.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
