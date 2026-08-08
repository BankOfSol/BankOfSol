import { Link } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";

const SERVICES = [
  {
    icon: "🌐",
    title: "Website development",
    body: "Marketing sites, storefronts, and full web apps — designed, built, and deployed on modern edge infrastructure like the site you're reading now.",
  },
  {
    icon: "📱",
    title: "App development",
    body: "Progressive web apps and mobile companions — installable, fast, and built to ship, not to sit in a backlog.",
  },
  {
    icon: "⚙️",
    title: "Business financial automation",
    body: "Payment flows, invoicing, reconciliation, crypto rails, and the glue between your tools — automate the money paperwork away.",
  },
];

export default function Consulting() {
  usePageMeta({ title: "Consulting" });
  return (
    <div className="page">
      <section className="hero" style={{ paddingBottom: 12 }}>
        <div className="hero-kicker">Consulting</div>
        <h1>Hire the hands that built the bank.</h1>
        <p className="hero-sub">
          Direct, senior-level work — no agency layers. You book time, we build
          the thing. Sessions are paid up front and confirmed instantly.
        </p>
        <div className="hero-ctas">
          <Link className="btn btn-gold" to="/book">
            Book a session
          </Link>
        </div>
      </section>

      <section className="pillars">
        {SERVICES.map((s) => (
          <div className="card pillar" key={s.title}>
            <span className="pillar-icon" aria-hidden>
              {s.icon}
            </span>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </section>

      <section className="section">
        <div className="section-kicker">How it works</div>
        <h2>Pick a slot. Pay. Build.</h2>
        <p className="muted" style={{ maxWidth: 640 }}>
          Choose a service and an open time on the{" "}
          <Link to="/book">booking page</Link> — times show in your timezone.
          Payment confirms the slot on the spot and you'll get a calendar
          invite by email. Cancel 24 hours or more before the session for a
          full automatic refund. Bigger project? Book a first session and we'll
          scope it together.
        </p>
      </section>
    </div>
  );
}
