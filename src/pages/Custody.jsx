import CustodyTeaser from "../components/CustodyTeaser.jsx";
import usePageMeta from "../lib/usePageMeta.js";

const PRINCIPLES = [
  {
    icon: "🧊",
    title: "Cold by default",
    body: "Client assets live on hardware that has never touched the internet — not a hot wallet, not an exchange, not a server.",
  },
  {
    icon: "✍️",
    title: "Signed by hand",
    body: "Withdrawals are requests. Each one is reviewed and signed offline on the hardware device, then verified on-chain before it closes.",
  },
  {
    icon: "🚫",
    title: "Never lent, never staked",
    body: "Your assets are never rehypothecated, loaned out, or put to work. No yield is offered — that's the point. Fees are for safekeeping.",
  },
  {
    icon: "👤",
    title: "Personally approved",
    body: "Every custody client is reviewed and approved by Sol, one at a time. Small on purpose.",
  },
];

export default function Custody() {
  usePageMeta({ title: "Custody" });
  return (
    <div className="page">
      <section className="hero" style={{ paddingBottom: 8 }}>
        <div className="hero-kicker">Solana custody</div>
        <h1>
          Cold storage, <span className="gold-grad">warm ledger.</span>
        </h1>
        <p className="hero-sub">
          Your Solana assets, held on offline hardware and visible in a live
          dashboard. Deposits verified on-chain. Withdrawals signed by hand.
          Slow where it should be slow, instant where it can be.
        </p>
      </section>

      <section className="pillars" style={{ marginTop: 8 }}>
        {PRINCIPLES.map((p) => (
          <div className="card pillar" key={p.title}>
            <span className="pillar-icon" aria-hidden>
              {p.icon}
            </span>
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </div>
        ))}
      </section>

      <section className="section" style={{ maxWidth: 720 }}>
        <div className="section-kicker">The vault</div>
        <CustodyTeaser />
      </section>

      <section className="section" style={{ maxWidth: 720 }}>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Bank of Sol is a technology and services company, not a chartered
          bank or licensed depository institution. Custodied digital assets
          are not FDIC insured, earn no interest or yield, and carry market
          risk borne solely by you. Custody is a self-directed safekeeping
          arrangement — see the <a href="/terms">Terms</a>.
        </p>
      </section>
    </div>
  );
}
