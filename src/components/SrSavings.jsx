import { useMemo, useState } from "react";

// The savings estimator. Your numbers, our arithmetic, nothing hidden: the
// formula is printed under the result. Defaults are labeled assumptions, not
// benchmarks — we have no verified industry figure to cite, so we don't.
const DEFAULTS = { hires: 15, refs: 3, attempts: 3, minutes: 6, rate: 45 };

const fmt = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const usd = (n) => "$" + fmt(n);

export default function SrSavings() {
  const [v, setV] = useState(DEFAULTS);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: Number(e.target.value) }));

  const out = useMemo(() => {
    const callsPerMonth = v.hires * v.refs * v.attempts;
    const hoursPerMonth = (callsPerMonth * v.minutes) / 60;
    const dollarsPerMonth = hoursPerMonth * v.rate;
    return {
      callsPerMonth,
      hoursPerMonth,
      hoursPerYear: hoursPerMonth * 12,
      dollarsPerYear: dollarsPerMonth * 12,
    };
  }, [v]);

  const fields = [
    ["hires", "Classified hires per month", 1, 80, 1, ""],
    ["refs", "References per hire", 1, 5, 1, ""],
    ["attempts", "Call attempts per reference", 1, 6, 1, ""],
    ["minutes", "Minutes per attempt, incl. notes", 2, 20, 1, " min"],
    ["rate", "Analyst cost per hour, loaded", 25, 120, 5, " $"],
  ];

  return (
    <div className="sr-calc">
      <div className="sr-calc-inputs">
        {fields.map(([k, label, min, max, step, unit]) => (
          <label className="sr-range" key={k}>
            <span className="sr-range-label">
              {label}
              <output className="sr-range-val">
                {unit === " $" ? "$" : ""}
                {v[k]}
                {unit === " min" ? " min" : ""}
              </output>
            </span>
            <input type="range" min={min} max={max} step={step} value={v[k]} onChange={set(k)} aria-label={label} />
          </label>
        ))}
      </div>
      <div className="sr-calc-out" aria-live="polite">
        <div className="sr-calc-big">
          <span className="sr-calc-num">{fmt(out.hoursPerYear)}</span>
          <span className="sr-calc-unit">analyst hours of phone tag per year</span>
        </div>
        <div className="sr-calc-row">
          <div>
            <b>{fmt(out.callsPerMonth)}</b>
            <span>call attempts a month</span>
          </div>
          <div>
            <b>{fmt(out.hoursPerMonth)}</b>
            <span>hours a month</span>
          </div>
          <div>
            <b>{usd(out.dollarsPerYear)}</b>
            <span>a year, at your rate</span>
          </div>
        </div>
        <p className="sr-calc-note">
          Arithmetic: hires × references × attempts × minutes ÷ 60, times your
          hourly cost. Ray takes the dialing, retries, and capture; your analysts
          keep the reading and the decision, so treat this as the ceiling on
          time returned, not a quote. Defaults are assumptions to replace with
          your own.
        </p>
      </div>
    </div>
  );
}
