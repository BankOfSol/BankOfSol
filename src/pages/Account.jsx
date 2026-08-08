import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authClient, useSession, signOut } from "../lib/auth-client.js";
import VerifyBanner from "../components/VerifyBanner.jsx";
import usePageMeta from "../lib/usePageMeta.js";

export default function Account() {
  usePageMeta({ title: "Your Account" });
  const { data, isPending } = useSession();
  const navigate = useNavigate();
  const user = data?.user;

  const [name, setName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState(null);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  const [newEmail, setNewEmail] = useState("");
  const [emBusy, setEmBusy] = useState(false);
  const [emMsg, setEmMsg] = useState(null);

  useEffect(() => {
    if (data?.user?.name) setName(data.user.name);
  }, [data?.user?.name]);

  if (isPending) return <div className="spinner">Loading…</div>;

  async function onSaveName(e) {
    e.preventDefault();
    setNameMsg(null);
    const next = name.trim();
    if (!next) return;
    setNameBusy(true);
    const { error } = await authClient.updateUser({ name: next });
    setNameBusy(false);
    setNameMsg(
      error
        ? { ok: false, text: error.message || "Could not update your name." }
        : { ok: true, text: "Name updated. ✔" }
    );
  }

  async function onChangePassword(e) {
    e.preventDefault();
    setPwMsg(null);
    if (pw.next.length < 8) {
      setPwMsg({ ok: false, text: "New password must be at least 8 characters." });
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwMsg({ ok: false, text: "New passwords don't match." });
      return;
    }
    setPwBusy(true);
    const { error } = await authClient.changePassword({
      currentPassword: pw.current,
      newPassword: pw.next,
      revokeOtherSessions: revokeOthers,
    });
    setPwBusy(false);
    if (error) {
      setPwMsg({
        ok: false,
        text: error.message || "Could not change your password. Check your current password.",
      });
      return;
    }
    setPw({ current: "", next: "", confirm: "" });
    setPwMsg({
      ok: true,
      text: revokeOthers
        ? "Password changed — other devices were logged out. ✔"
        : "Password changed. ✔",
    });
  }

  async function onChangeEmail(e) {
    e.preventDefault();
    setEmMsg(null);
    const target = newEmail.trim().toLowerCase();
    if (!target) return;
    if (target === (user?.email || "").toLowerCase()) {
      setEmMsg({ ok: false, text: "That's already your email." });
      return;
    }
    setEmBusy(true);
    const { error } = await authClient.changeEmail({
      newEmail: target,
      callbackURL: "/account",
    });
    setEmBusy(false);
    if (error) {
      setEmMsg({ ok: false, text: error.message || "Could not change your email." });
      return;
    }
    // A confirmation link goes to the CURRENT address — it's the address that
    // can veto the change. Never report "already taken" (that would leak who
    // has an account).
    setNewEmail("");
    setEmMsg({
      ok: true,
      text: `Check ${user?.email} for a confirmation link to approve the change.`,
    });
  }

  async function onSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="page narrow">
      <h1>Your account</h1>
      <VerifyBanner />

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Profile</h3>
        <p className="muted" style={{ fontSize: "0.92rem" }}>
          Signed in as <strong>{user?.email}</strong>
        </p>
        <form onSubmit={onSaveName}>
          <div className="form-field">
            <label htmlFor="name">Display name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {nameMsg && (
            <div className={`form-result ${nameMsg.ok ? "success" : "error"}`}>{nameMsg.text}</div>
          )}
          <button className="btn btn-ghost btn-sm" disabled={nameBusy}>
            {nameBusy ? "Saving…" : "Save name"}
          </button>
        </form>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Change password</h3>
        <form onSubmit={onChangePassword}>
          <div className="form-field">
            <label htmlFor="pw-current">Current password</label>
            <input
              id="pw-current"
              type="password"
              required
              autoComplete="current-password"
              value={pw.current}
              onChange={(e) => setPw((s) => ({ ...s, current: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label htmlFor="pw-new">New password</label>
            <input
              id="pw-new"
              type="password"
              required
              autoComplete="new-password"
              value={pw.next}
              onChange={(e) => setPw((s) => ({ ...s, next: e.target.value }))}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="form-field">
            <label htmlFor="pw-confirm2">Confirm new password</label>
            <input
              id="pw-confirm2"
              type="password"
              required
              autoComplete="new-password"
              value={pw.confirm}
              onChange={(e) => setPw((s) => ({ ...s, confirm: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label className="row" style={{ fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={revokeOthers}
                onChange={(e) => setRevokeOthers(e.target.checked)}
              />
              Log out my other devices
            </label>
          </div>
          {pwMsg && (
            <div className={`form-result ${pwMsg.ok ? "success" : "error"}`}>{pwMsg.text}</div>
          )}
          <button className="btn btn-ghost btn-sm" disabled={pwBusy}>
            {pwBusy ? "Saving…" : "Change password"}
          </button>
        </form>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Change email</h3>
        <form onSubmit={onChangeEmail}>
          <div className="form-field">
            <label htmlFor="new-email">New email</label>
            <input
              id="new-email"
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@email.com"
            />
            <span className="hint">
              A confirmation link goes to your current address first.
            </span>
          </div>
          {emMsg && (
            <div className={`form-result ${emMsg.ok ? "success" : "error"}`}>{emMsg.text}</div>
          )}
          <button className="btn btn-ghost btn-sm" disabled={emBusy}>
            {emBusy ? "Sending…" : "Change email"}
          </button>
        </form>
      </div>

      <button className="btn btn-danger" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );
}
