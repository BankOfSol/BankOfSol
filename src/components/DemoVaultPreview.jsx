// The vault preview that lives under the locked overlay. DELIBERATELY takes
// no data props: every figure comes from the DEMO_VAULT constant below, so no
// real-data path can ever feed this component — and the demo labeling
// (ribbon, watermark, per-figure chips, footer) travels with it structurally.
// No APY, no yield, no percentages framed as returns. Enticing ≠ deceptive.

export const DEMO_VAULT = {
  totalUsd: "1,834.20",
  sol: "12.5",
  usdc: "420.00",
  chart: [4, 9, 7, 14, 12, 19, 17, 26, 24, 31, 36, 42],
  deposits: [
    { when: "Jul 28", asset: "SOL", amount: "+5.0" },
    { when: "Jul 12", asset: "USDC", amount: "+420.00" },
    { when: "Jun 30", asset: "SOL", amount: "+7.5" },
  ],
};

function DemoChart() {
  const points = DEMO_VAULT.chart;
  const max = Math.max(...points);
  const W = 560;
  const H = 120;
  const step = W / (points.length - 1);
  const xy = points.map((v, i) => [i * step, H - (v / max) * (H - 14) - 6]);
  const line = xy.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label="Demo growth chart (simulated data)"
    >
      <defs>
        <linearGradient id="demo-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16C784" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#16C784" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#demo-fill)" />
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

export default function DemoVaultPreview() {
  return (
    <div className="panel" style={{ position: "relative", overflow: "hidden" }}>
      <div className="demo-ribbon">PREVIEW</div>
      <div className="demo-watermark" aria-hidden />

      <div className="spread" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>🏦 Your vault</h3>
        <span className="badge badge-green">Cold storage</span>
      </div>

      <div className="vault-stats">
        <div className="vault-stat">
          <div className="stat-label">Total value</div>
          <div className="stat-value">
            ${DEMO_VAULT.totalUsd}
            <span className="demo-chip">DEMO</span>
          </div>
          <div className="stat-delta">▲ growing</div>
        </div>
        <div className="vault-stat">
          <div className="stat-label">SOL</div>
          <div className="stat-value">
            {DEMO_VAULT.sol}
            <span className="demo-chip">DEMO</span>
          </div>
        </div>
        <div className="vault-stat">
          <div className="stat-label">USDC</div>
          <div className="stat-value">
            {DEMO_VAULT.usdc}
            <span className="demo-chip">DEMO</span>
          </div>
        </div>
      </div>

      <div style={{ margin: "18px 0 6px", position: "relative" }}>
        <DemoChart />
      </div>

      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th>Deposit</th>
              <th>Asset</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_VAULT.deposits.map((d) => (
              <tr key={d.when + d.asset}>
                <td className="muted">{d.when}</td>
                <td>{d.asset}</td>
                <td className="green mono">
                  {d.amount}
                  <span className="demo-chip">DEMO</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ fontSize: "0.78rem", marginTop: 12, marginBottom: 0 }}>
        Simulated preview for illustration — not real balances, and not a
        projection of returns. Custodied assets earn no yield.
      </p>
    </div>
  );
}
