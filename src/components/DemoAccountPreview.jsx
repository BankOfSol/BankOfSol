// The member-account preview that lives under the locked overlay.
// DELIBERATELY takes no data props: every figure comes from the DEMO_ACCOUNT
// constant below, so no real-data path can ever feed this component — and the
// demo labeling (ribbon, watermark, per-figure chips, footer) travels with it
// structurally. Enticing ≠ deceptive.

export const DEMO_ACCOUNT = {
  balance: "Settled",
  engagement: "Storefront build",
  engagementStatus: "active",
  chart: [3, 6, 5, 9, 8, 13, 12, 17, 16, 22, 26, 30],
  ledger: [
    { when: "Aug 2", label: "Payment — INV-DEMO42", amount: "−$2,400.00", credit: true },
    { when: "Jul 28", label: "Invoice INV-DEMO42 — Storefront build", amount: "+$2,400.00" },
    { when: "Jul 21", label: "Working session — completed", amount: "−$150.00", credit: true },
  ],
};

function DemoChart() {
  const points = DEMO_ACCOUNT.chart;
  const max = Math.max(...points);
  const W = 560;
  const H = 110;
  const step = W / (points.length - 1);
  const xy = points.map((v, i) => [i * step, H - (v / max) * (H - 14) - 6]);
  const line = xy.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label="Demo account activity (simulated data)"
    >
      <defs>
        <linearGradient id="demo-acct-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16C784" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#16C784" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#demo-acct-fill)" />
      <polyline
        points={line}
        fill="none"
        stroke="#16C784"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DemoAccountPreview() {
  return (
    <div className="panel" style={{ position: "relative", overflow: "hidden" }}>
      <div className="demo-ribbon">PREVIEW</div>
      <div className="demo-watermark" aria-hidden />

      <div className="spread" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>🧾 Your account</h3>
        <span className="badge badge-green">Member</span>
      </div>

      <div className="vault-stats">
        <div className="vault-stat">
          <div className="stat-label">Balance</div>
          <div className="stat-value green">
            {DEMO_ACCOUNT.balance}
            <span className="demo-chip">DEMO</span>
          </div>
        </div>
        <div className="vault-stat">
          <div className="stat-label">Engagement</div>
          <div className="stat-value" style={{ fontSize: "1.02rem" }}>
            {DEMO_ACCOUNT.engagement}
            <span className="demo-chip">DEMO</span>
          </div>
          <div className="stat-delta">● {DEMO_ACCOUNT.engagementStatus}</div>
        </div>
        <div className="vault-stat">
          <div className="stat-label">Activity</div>
          <div style={{ marginTop: 6 }}>
            <DemoChart />
          </div>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="list">
          <thead>
            <tr>
              <th>Date</th>
              <th>Entry</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_ACCOUNT.ledger.map((row) => (
              <tr key={row.label}>
                <td className="muted">{row.when}</td>
                <td>{row.label}</td>
                <td className={`mono ${row.credit ? "green" : ""}`}>
                  {row.amount}
                  <span className="demo-chip">DEMO</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ fontSize: "0.78rem", marginTop: 12, marginBottom: 0 }}>
        Simulated preview for illustration — not a real account, not real
        amounts.
      </p>
    </div>
  );
}
