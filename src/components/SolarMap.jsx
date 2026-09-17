import { fmtUsd } from "../lib/money.js";

// The solar map: the sun at the center, one glowing tendril per ecosystem,
// POUND on the first. Pure SVG + CSS keyframes (flow along the tendrils,
// a slow pulse on the nodes); prefers-reduced-motion turns the motion off
// in site.css. Click a node to select it.
const R_SUN = 92;
const R_ORBIT = 215;
const SIZE = 600;
const C = SIZE / 2;

const STATUS_RING = {
  live: "var(--green)",
  building: "var(--gold)",
  seed: "var(--ink-dim)",
  paused: "var(--ink-dim)",
  closed: "var(--red)",
};

export default function SolarMap({ ecosystems = [], selectedId, onSelect }) {
  const n = Math.max(ecosystems.length, 1);
  const nodes = ecosystems.map((e, i) => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180);
    const x = C + R_ORBIT * Math.cos(a);
    const y = C + R_ORBIT * Math.sin(a);
    const sx = C + (R_SUN + 6) * Math.cos(a);
    const sy = C + (R_SUN + 6) * Math.sin(a);
    // Curl the tendril: control point swung off the straight line.
    const mx = C + (R_SUN + 70) * Math.cos(a + 0.55);
    const my = C + (R_SUN + 70) * Math.sin(a + 0.55);
    const path = `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
    const pct = e.monthlyTargetCents > 0 ? Math.min(100, Math.round((e.monthCents / e.monthlyTargetCents) * 100)) : null;
    return { e, x, y, path, pct, i };
  });

  return (
    <svg className="solar-map" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="The sun and its ecosystems">
      <defs>
        <clipPath id="sunClip">
          <circle cx={C} cy={C} r={R_SUN} />
        </clipPath>
        <radialGradient id="sunGlow">
          <stop offset="55%" stopColor="rgba(255,120,30,0.35)" />
          <stop offset="100%" stopColor="rgba(255,120,30,0)" />
        </radialGradient>
        {nodes.map(({ e, i }) => (
          <linearGradient key={e.id} id={`tendril-${i}`} gradientUnits="userSpaceOnUse" x1={C} y1={C} x2={nodes[i].x} y2={nodes[i].y}>
            <stop offset="0%" stopColor="#ff8a1f" />
            <stop offset="100%" stopColor={e.color || "#ff6b1a"} />
          </linearGradient>
        ))}
      </defs>

      <circle className="solar-glow" cx={C} cy={C} r={R_SUN + 70} fill="url(#sunGlow)" />

      {nodes.map(({ e, path, i }) => (
        <g key={`t-${e.id}`} className={`tendril${e.status === "paused" || e.status === "closed" ? " dim" : ""}`}>
          <path d={path} stroke={`url(#tendril-${i})`} strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.35" />
          <path className="tendril-flow" d={path} stroke={`url(#tendril-${i})`} strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      ))}

      <image href="/sun.webp" x={C - R_SUN} y={C - R_SUN} width={R_SUN * 2} height={R_SUN * 2} clipPath="url(#sunClip)" className="solar-sun" />

      {nodes.map(({ e, x, y, pct }) => {
        const selected = selectedId === e.id;
        return (
          <g
            key={e.id}
            className={`eco-node${selected ? " selected" : ""}`}
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
            onClick={() => onSelect?.(e)}
            role="button"
            tabIndex={0}
            onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && onSelect?.(e)}
          >
            <circle r="44" fill={e.color} opacity="0.12" className="eco-pulse" />
            <circle r="30" fill="var(--panel)" stroke={STATUS_RING[e.status] || "var(--line)"} strokeWidth="2" />
            <circle r="24" fill={e.color} opacity={e.status === "live" ? 0.9 : 0.45} />
            {pct !== null && (
              <circle
                r="30"
                fill="none"
                stroke="var(--ink)"
                strokeWidth="3"
                strokeDasharray={`${(pct / 100) * 188.5} 188.5`}
                transform="rotate(-90)"
                strokeLinecap="round"
                opacity="0.9"
              />
            )}
            <text y="52" textAnchor="middle" className="eco-label">{e.name}</text>
            <text y="68" textAnchor="middle" className="eco-sub">
              {e.monthCents ? fmtUsd(e.monthCents) : e.status}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
