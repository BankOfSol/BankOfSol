import { Link } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";

// The landing page. One job: get the right person onto a call. Everything
// else on the page exists to answer "can they build my thing?" and then get
// out of the way — minimal sections, one primary action repeated at the top
// and bottom.
const SERVICES = [
  {
    n: "01",
    title: "Web applications",
    body: "Customer portals, dashboards, storefronts, internal tools. Designed, built, and shipped on modern edge infrastructure — the platform you're reading this on is our own work.",
  },
  {
    n: "02",
    title: "Financial automation",
    body: "Invoicing, payments, reconciliation, reporting, and the glue between the tools you already pay for. We take the money paperwork off your desk and make it run itself.",
  },
  {
    n: "03",
    title: "AI education & consulting",
    body: "Practical AI in your business, taught in plain language: where it actually helps, what to automate first, and how to put it into production without betting the company on it.",
  },
];

const STEPS = [
  ["Start a call", "Book a slot in a couple of clicks. We talk through what you want built and whether we're the right fit."],
  ["Get a plan", "You leave with a clear scope, a timeline, and a number — not a vague proposal three weeks later."],
  ["We build it", "Work runs through your member account: every engagement, invoice, and payment itemized, so you always know where things stand."],
];

export default function Home() {
  usePageMeta({});
  return (
    <div className="page lp">
      <section className="lp-hero">
        <div className="lp-eyebrow">Bank of Sol</div>
        <h1 className="lp-title">
          We build the thing
          <br />
          <span className="gold-grad">you keep meaning to build.</span>
        </h1>
        <p className="lp-lede">
          Web applications, financial automation, and AI consulting — built by
          the people who'll actually be doing the work. Start with a call.
        </p>
        <div className="lp-actions">
          <Link className="btn btn-gold btn-lg" to="/book">
            Start a call
          </Link>
          <Link className="btn btn-ghost btn-lg" to="/consulting">
            What we do
          </Link>
        </div>
        <p className="lp-note">
          Real availability, real calendar. Sessions confirm instantly and are
          fully refundable up to 24 hours before.
        </p>
      </section>

      <hr className="lp-rule" />

      <section className="lp-section">
        <div className="section-kicker">What we build</div>
        <div className="service-rows">
          {SERVICES.map((s) => (
            <div className="service-row" key={s.n}>
              <span className="service-index mono">{s.n}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-band">
        <div className="section-kicker">For people starting out in AI</div>
        <h2>Thinking about consulting with AI yourself?</h2>
        <p>
          If you're early in this and want to build a real practice around it,
          we work with a small number of people on exactly that: choosing a
          niche, building an offer you can stand behind, setting up the tooling
          and delivery process, and pricing the work honestly. No hype, no
          guaranteed-income promises — just the skills and the setup, from
          someone doing the work every day.
        </p>
        <p className="muted lp-band-note">
          We're selective here on purpose, and we like working with people who
          are serious about it. Bring your questions to a call and we'll tell
          you straight whether we can help.
        </p>
        <Link className="btn btn-green" to="/book">
          Talk it through
        </Link>
      </section>

      <section className="lp-section">
        <div className="section-kicker">How it works</div>
        <div className="lp-steps">
          {STEPS.map(([title, body], i) => (
            <div className="lp-step" key={title}>
              <span className="lp-step-n mono">{i + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-close">
        <h2>Bring the idea. We'll build the thing.</h2>
        <p>
          The fastest way to find out if this works is a conversation. Pick a
          time that suits you.
        </p>
        <div className="lp-actions">
          <Link className="btn btn-gold btn-lg" to="/book">
            Start a call
          </Link>
          <Link className="btn btn-ghost btn-lg" to="/membership">
            Become a member
          </Link>
        </div>
      </section>
    </div>
  );
}
