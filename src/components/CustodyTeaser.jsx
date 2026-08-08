import { useState } from "react";
import { Link } from "react-router-dom";
import { useMe } from "../lib/me-context.jsx";
import { useSession } from "../lib/auth-client.js";
import { api } from "../lib/api.js";
import DemoVaultPreview from "./DemoVaultPreview.jsx";

// The locked vault: a blurred demo preview under a scrim, with a three-step
// progress tracker that pulls people through account → verify → personal
// approval. The enticement is the *almost-there* feeling — the numbers behind
// the blur are structurally demo-labeled (see DemoVaultPreview).
function Step({ state, n, children }) {
  // state: 'done' | 'pending' | 'todo'
  return (
    <div className={`progress-step ${state}`}>
      <span className="step-dot">{state === "done" ? "✓" : n}</span>
      <span>{children}</span>
    </div>
  );
}

export default function CustodyTeaser() {
  const { data } = useSession();
  const { me, custody, refresh } = useMe();
  const [motivation, setMotivation] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const signedIn = !!data?.user;
  const verified = !!me?.emailVerified;
  const status = custody?.status || null;

  async function apply(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api.custodyApply({ motivation: motivation.trim() || undefined });
      refresh();
    } catch (e2) {
      setErr(e2.message || "Could not submit your application");
    } finally {
      setBusy(false);
    }
  }

  // Approved: the state the whole funnel points at.
  if (status === "approved") {
    return (
      <div>
        <div className="form-result success" style={{ marginBottom: 14 }}>
          <strong>You're approved.</strong> Vault onboarding opens shortly —
          Sol will contact you personally with your dedicated deposit address.
        </div>
        <DemoVaultPreview />
      </div>
    );
  }

  if (status === "rejected" || status === "suspended" || status === "closed") {
    return (
      <div className="panel">
        <h3>About your application</h3>
        <p className="muted">
          Your custody application is <strong>{status}</strong>. If you'd like
          to talk it through, reply to the decision email — a real person
          answers.
        </p>
      </div>
    );
  }

  const steps = (
    <div className="progress-steps">
      <Step n="1" state={signedIn ? "done" : "pending"}>
        Account created
      </Step>
      <Step n="2" state={verified ? "done" : signedIn ? "pending" : "todo"}>
        Email verified
      </Step>
      <Step
        n="3"
        state={status === "applied" ? "pending" : "todo"}
      >
        Personal approval by Sol
        {status === "applied" && custody?.appliedAt
          ? ` — applied ${new Date(custody.appliedAt).toLocaleDateString()}`
          : ""}
      </Step>
    </div>
  );

  return (
    <div className="teaser-wrap">
      <div className="teaser-blur">
        <DemoVaultPreview />
      </div>
      <div className="teaser-scrim">
        <div className="lock-panel">
          <h3>🔒 Your vault is waiting</h3>
          <p className="lock-sub">
            Every vault is opened personally. No queues you can buy your way
            past — just Sol, reviewing every application by hand.
          </p>
          {steps}

          {!signedIn && (
            <>
              <Link className="btn btn-gold btn-block" to="/signup?next=/custody">
                Open your account
              </Link>
              <p className="panel-switch" style={{ textAlign: "center" }}>
                Already have one?{" "}
                <Link to="/login" state={{ from: "/custody" }}>
                  Log in
                </Link>
              </p>
            </>
          )}

          {signedIn && !verified && (
            <p className="lock-sub" style={{ marginTop: 10 }}>
              Check your inbox for the verification link — approval can't start
              until your email is real.
            </p>
          )}

          {signedIn && verified && !status && (
            <form onSubmit={apply} style={{ textAlign: "left" }}>
              <div className="form-field" style={{ marginTop: 8 }}>
                <label htmlFor="motivation">What would you custody?</label>
                <textarea
                  id="motivation"
                  rows={2}
                  value={motivation}
                  onChange={(e) => setMotivation(e.target.value)}
                  placeholder="e.g. long-term SOL holdings I don't want on an exchange"
                />
              </div>
              {err && <div className="form-result error">{err}</div>}
              <button className="btn btn-green btn-block" disabled={busy}>
                {busy ? "Submitting…" : "Apply for your vault"}
              </button>
            </form>
          )}

          {status === "applied" && (
            <p className="lock-sub" style={{ marginTop: 10 }}>
              <span className="green" style={{ fontWeight: 800 }}>
                You're almost in.
              </span>{" "}
              Sol reviews every application personally — you'll get an email
              the moment the decision lands. Most reviews happen within a day.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
