import { Link } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";

const PILLARS = [
  {
    icon: "🧾",
    title: "Membership",
    body: "A personal account with Sol: onboarding, engagements, and every bill and payment itemized like a bank statement. Approved one at a time.",
    to: "/membership",
    link: "Apply for membership →",
  },
  {
    icon: "🛠️",
    title: "Consulting",
    body: "Websites, apps, and business financial automation — scoped, built, and shipped by the same hands that built this platform.",
    to: "/consulting",
    link: "See services →",
  },
  {
    icon: "📅",
    title: "Book time",
    body: "Pick an open slot, pay, and it's confirmed on the spot — with a calendar invite in your inbox. Times shown in your timezone.",
    to: "/book",
    link: "See open times →",
  },
  {
    icon: "🛒",
    title: "The shop",
    body: "Physical goods and 3D-printed products, made to order and shipped to you.",
    to: "/shop",
    link: "Browse the shop →",
  },
];

export default function Home() {
  usePageMeta({});
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-kicker">Private client services</div>
        <h1>
          The <span className="gold-grad">Bank of Sol</span>
        </h1>
        <p className="hero-sub">
          One builder, taken seriously. Members bring the work — websites,
          apps, financial automation — and get a running account where every
          engagement, session, and payment is itemized with bank-statement
          clarity.
        </p>
        <div className="hero-ctas">
          <Link className="btn btn-gold" to="/membership">
            Become a member
          </Link>
          <Link className="btn btn-ghost" to="/book">
            Book time with Sol
          </Link>
        </div>
      </section>

      <section className="pillars">
        {PILLARS.map((p) => (
          <div className="card pillar" key={p.title}>
            <span className="pillar-icon" aria-hidden>
              {p.icon}
            </span>
            <h3>{p.title}</h3>
            <p>{p.body}</p>
            <Link className="pillar-link" to={p.to}>
              {p.link}
            </Link>
          </div>
        ))}
      </section>

      <section className="section">
        <div className="section-kicker">How membership works</div>
        <h2>Apply. Onboard. Build.</h2>
        <div className="pillars">
          <div className="card pillar">
            <h3>1 · Apply</h3>
            <p>
              Create an account and tell Sol what you want to build. Every
              application is reviewed personally — no automation, no queues.
            </p>
          </div>
          <div className="card pillar">
            <h3>2 · Onboard</h3>
            <p>
              Your engagement gets scoped into your account: what's being
              built, what it costs, and when. Invoices arrive itemized, and
              you pay them where you can see them.
            </p>
          </div>
          <div className="card pillar">
            <h3>3 · Build</h3>
            <p>
              Booked sessions, steady progress, and a ledger that always
              matches reality. When the work ships, your review goes on the
              record.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
