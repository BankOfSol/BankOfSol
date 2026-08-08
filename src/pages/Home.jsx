import { Link } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";

const PILLARS = [
  {
    icon: "🏦",
    title: "Cold-storage custody",
    body: "Your assets held on hardware that has never touched the internet. Every vault approved personally. Every withdrawal signed by hand, offline.",
    to: "/custody",
    link: "Apply for a vault →",
  },
  {
    icon: "💸",
    title: "Crypto payments",
    body: "A Stripe-style checkout for Solana. Your customers pay in SOL or USDC straight to your wallet — we never hold your funds.",
    to: "/custody",
    link: "Coming soon",
  },
  {
    icon: "🛠️",
    title: "Consulting",
    body: "Websites, apps, and business financial automation — built by the same hands that built this. Book paid time directly.",
    to: "/consulting",
    link: "See services →",
  },
  {
    icon: "🛒",
    title: "The shop",
    body: "Physical goods and 3D-printed products, made to order and shipped to you. Card checkout, crypto coming.",
    to: "/shop",
    link: "Browse the shop →",
  },
];

export default function Home() {
  usePageMeta({});
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-kicker">Safety over everything</div>
        <h1>
          The <span className="gold-grad">Bank of Sol</span>
        </h1>
        <p className="hero-sub">
          Solana custody with keys that never touch the internet, crypto
          payments for businesses, and hands-on consulting. A bank makes money
          lending your deposits out — we don't. Your assets sit in cold
          storage, and we earn fees for services instead.
        </p>
        <div className="hero-ctas">
          <Link className="btn btn-gold" to="/custody">
            Open a vault
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
        <div className="section-kicker">How custody works</div>
        <h2>Keys cold. Ledger live.</h2>
        <div className="pillars">
          <div className="card pillar">
            <h3>1 · Apply</h3>
            <p>
              Create an account and apply. Every custody client is reviewed and
              approved personally — no exceptions, no automation.
            </p>
          </div>
          <div className="card pillar">
            <h3>2 · Deposit</h3>
            <p>
              You get a dedicated Solana deposit address generated on offline
              hardware. Deposits show up in your dashboard, verified on-chain.
            </p>
          </div>
          <div className="card pillar">
            <h3>3 · Withdraw</h3>
            <p>
              Withdrawals are requests. Each one is signed by hand on the
              offline device, then verified on-chain before it's closed. Slow
              by design — that's the security model.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
