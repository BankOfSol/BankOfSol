import { Link } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";

const SERVICES = [
  {
    n: "01",
    title: "Web applications",
    body: "Customer portals, dashboards, storefronts, booking and billing systems, internal tools. Designed, built, and deployed on modern edge infrastructure — fast by default, and yours to keep.",
    detail: ["Product and scope shaping", "Design and build", "Deployment, domains, and handover"],
  },
  {
    n: "02",
    title: "Financial automation",
    body: "The money paperwork, automated: invoicing, payment collection, reconciliation, recurring billing, reporting, and the integrations between the tools you already pay for.",
    detail: ["Payments and checkout flows", "Invoicing and ledgers", "Reporting and reconciliation"],
  },
  {
    n: "03",
    title: "AI education & consulting",
    body: "Practical AI for your business or your own practice — where it genuinely helps, what to automate first, and how to run it in production without betting the company on it.",
    detail: ["Team workshops in plain language", "Workflow and tooling setup", "Guidance for new AI consultants"],
  },
];

export default function Consulting() {
  usePageMeta({ title: "Consulting" });
  return (
    <div className="page lp">
      <section className="lp-hero" style={{ paddingBottom: 36 }}>
        <div className="lp-eyebrow">Consulting</div>
        <h1 className="lp-title" style={{ fontSize: "clamp(1.9rem, 5vw, 3rem)" }}>
          Senior work, no agency layers.
        </h1>
        <p className="lp-lede">
          You talk to the person doing the building. Sessions are booked
          directly, confirmed on the spot, and the work is itemized in your
          account from day one.
        </p>
        <div className="lp-actions">
          <Link className="btn btn-gold btn-lg" to="/book">
            Start a call
          </Link>
        </div>
      </section>

      <hr className="lp-rule" />

      <section className="lp-section">
        <div className="service-rows">
          {SERVICES.map((s) => (
            <div className="service-row" key={s.n}>
              <span className="service-index mono">{s.n}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <ul className="muted" style={{ margin: "10px 0 0", paddingLeft: "1.1em", fontSize: "0.92rem" }}>
                  {s.detail.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-band">
        <div className="section-kicker">Getting started in AI</div>
        <h2>Building your own AI practice</h2>
        <p>
          If you're new to this and want to consult with AI yourself, we work
          with a small number of people on the unglamorous parts: picking a
          niche, shaping an offer you can deliver, setting up your tooling, and
          pricing the work honestly. What you get is capability and a working
          setup — not income promises.
        </p>
        <Link className="btn btn-green" to="/book">
          Talk it through
        </Link>
      </section>

      <section className="lp-section">
        <div className="section-kicker">How it works</div>
        <h2>Pick a slot. Talk. Build.</h2>
        <p className="muted" style={{ maxWidth: 640 }}>
          Choose a service and an open time on the{" "}
          <Link to="/book">booking page</Link> — times show in your timezone.
          Payment confirms the slot on the spot and a calendar invite lands in
          your inbox. Cancel 24 hours or more before the session for a full
          automatic refund. Bigger project? Start with a call and we'll scope
          it together.
        </p>
      </section>
    </div>
  );
}
