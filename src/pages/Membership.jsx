import MembershipTeaser from "../components/MembershipTeaser.jsx";
import usePageMeta from "../lib/usePageMeta.js";

const PRINCIPLES = [
  {
    icon: "👤",
    title: "Personally approved",
    body: "Every member is reviewed and approved by Sol, one at a time. Small on purpose — you're never a ticket number.",
  },
  {
    icon: "🧾",
    title: "Itemized like a bank",
    body: "Every engagement, invoice, and payment lands on your account ledger. You always know exactly where you stand.",
  },
  {
    icon: "🛠️",
    title: "A direct line",
    body: "Websites, apps, business financial automation — you work with the person who builds it, from scoping to shipping.",
  },
  {
    icon: "💳",
    title: "Pay your way",
    body: "Card checkout built in, with flexible payment options inside your account. Invoices settle where you can see them.",
  },
];

export default function Membership() {
  usePageMeta({ title: "Membership" });
  return (
    <div className="page">
      <section className="hero" style={{ paddingBottom: 8 }}>
        <div className="hero-kicker">Membership</div>
        <h1>
          A bank-grade account for <span className="gold-grad">the work we do together.</span>
        </h1>
        <p className="hero-sub">
          Bank of Sol members get more than booked hours: a running account
          where onboarding, engagements, bills, and payments are itemized like
          a bank statement — with Sol personally on the other side of it.
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
        <div className="section-kicker">Your account</div>
        <MembershipTeaser />
      </section>

      <section className="section" style={{ maxWidth: 720 }}>
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Bank of Sol is a technology and services company, not a chartered
          bank or licensed depository institution. Member accounts are service
          ledgers, not deposit accounts — see the <a href="/terms">Terms</a>.
        </p>
      </section>
    </div>
  );
}
