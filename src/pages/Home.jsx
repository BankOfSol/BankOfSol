import { useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../lib/auth-client.js";
import { api } from "../lib/api.js";
import usePageMeta from "../lib/usePageMeta.js";

// The whole public site: the sun, a way onto the waitlist, and a way in.
export default function Home() {
  usePageMeta({});
  const { data } = useSession();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function join(e) {
    e.preventDefault();
    setResult(null);
    setBusy(true);
    try {
      const r = await api.joinWaitlist({ email, name, website });
      setResult({ ok: true, text: r.already ? "You're already on the list." : "You're on the list. We'll be in touch." });
      setEmail("");
      setName("");
    } catch (e2) {
      setResult({ ok: false, text: e2.message });
    }
    setBusy(false);
  }

  return (
    <div className="page sun-page">
      <div className="sun-wrap">
        <img className="sun-hero" src="/sun.webp" width="640" height="640" alt="" decoding="async" fetchPriority="high" />
        {/* POUND rides the first tendril — the sun is what powers it. */}
        <a className="sun-tendril-tag" href="https://poundplay.com" target="_blank" rel="noreferrer" title="POUND — powered by the sun">
          POUND
        </a>
      </div>
      <h1 className="sun-title">Bank of Sol</h1>
      <p className="sun-lede muted">Members only, by invitation. Leave your email and we'll reach out.</p>

      <form className="sun-form" onSubmit={join} aria-live="polite">
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          maxLength={120}
          autoComplete="name"
        />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          maxLength={160}
          autoComplete="email"
        />
        <button className="btn btn-gold" disabled={busy}>
          {busy ? "Adding…" : "Add me to the waitlist"}
        </button>
        {result && <div className={`form-result ${result.ok ? "success" : "error"}`}>{result.text}</div>}
      </form>

      <div className="sun-login">
        {data?.user ? (
          <Link className="btn btn-ghost btn-sm" to="/dashboard">
            Your account →
          </Link>
        ) : (
          <Link className="btn btn-ghost btn-sm" to="/login">
            Log in
          </Link>
        )}
      </div>
    </div>
  );
}
