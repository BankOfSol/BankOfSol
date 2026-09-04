import { useState } from "react";
import { api } from "../lib/api.js";
import usePageMeta from "../lib/usePageMeta.js";
import { isSolRayHost } from "../lib/host.js";

// Sol & Ray — the landing page for a product line with its own audience:
// Personnel Commissions and HR offices at California school districts. One
// job: turn a director's "could this work here?" into a pilot request. Every
// claim on this page is one the product can keep (see the legal packet's
// security one-pager); no vendor names, no numbers we haven't verified.

const CONTACT_EMAIL = "Kaasi.serrano@gmail.com";

const STEPS = [
  ["Your questions, unchanged", "Your analyst loads the candidate, the references they listed, and your own reference questions. Ray never adds questions of its own."],
  ["References opt in first", "Each reference gets an invitation in the district's name and picks a time. Nobody is called or texted without saying yes."],
  ["Ray makes the call", "At that time Ray calls, introduces itself as an AI assistant on a recorded line, asks your questions, and records the answers word for word."],
  ["Your staff decide", "Transcripts and verbatim answers land in the Personnel Director's queue. Anyone who wants a person goes to a callback list for your team."],
];

const YES = [
  ["Records what the reference actually said", "Verbatim answers and the full transcript, plus the recording for 30 days."],
  ["Chases the reference, not your analyst", "Retries inside the reference's chosen window, only 9 a.m. to 9 p.m. Pacific."],
  ["Keeps reference material confidential", "Delivered only to the Personnel Director and analysts you name. Interview panels never see it."],
  ["Hands off to a human on request", "Any reference can decline the automated call or ask for a person at any point."],
];

const NO = [
  ["No scores, ratings, or rankings", "Ray does not summarize a reference into a grade or flag a candidate."],
  ["No screening decisions", "Nobody is advanced or screened out by software. Your staff read the answers and decide."],
  ["No unsolicited calls", "No AI-voice call or automated text goes to anyone who has not opted in."],
  ["No training on your data", "Every subprocessor is bound to no-training, zero-retention terms."],
];

const SECURITY = [
  ["District sign-in", "Your staff use the district's Microsoft account. No separate passwords to manage or lose."],
  ["Every view logged", "An audit log records each time a record is viewed, exported, or downloaded. You can export it."],
  ["Encrypted, US-only", "Encrypted in transit and at rest; recordings and transcripts stay in United States regions."],
  ["Deleted on schedule", "Recordings deleted after 30 days. Everything deleted within 30 days of contract end, confirmed in writing."],
  ["Disclosures built in", "AI-voice notice, recording notice, and a live introduction on every call. Candidate authorization collected before any reference is contacted."],
  ["Written commitments", "A security one-pager and a data-processing agreement, ready for your IT and legal review before the pilot starts."],
];

const VOLUMES = [
  "Not sure yet",
  "Under 10 hires a month",
  "10 to 30 hires a month",
  "More than 30 hires a month",
];

function PilotForm() {
  const [form, setForm] = useState({ name: "", title: "", org: "", email: "", phone: "", volume: "", message: "", website: "" });
  const [state, setState] = useState({ busy: false, error: "", done: false });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: "", done: false });
    try {
      await api.solrayPilotRequest(form);
      setState({ busy: false, error: "", done: true });
    } catch (err) {
      setState({ busy: false, error: err.message || "Something went wrong — email us instead.", done: false });
    }
  };

  if (state.done) {
    return (
      <div className="sr-form sr-done" id="pilot">
        <h3>Request received.</h3>
        <p className="muted" style={{ color: "var(--sr-dim)" }}>
          Isaak will reply personally within two business days with a short call
          time and the security one-pager. A confirmation is on its way to{" "}
          <strong style={{ color: "var(--sr-ink)" }}>{form.email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form className="sr-form" id="pilot" onSubmit={submit} noValidate>
      <div className="form-row">
        <div className="form-field">
          <label htmlFor="sr-name">Your name</label>
          <input id="sr-name" value={form.name} onChange={set("name")} autoComplete="name" required />
        </div>
        <div className="form-field">
          <label htmlFor="sr-title">Title</label>
          <input id="sr-title" value={form.title} onChange={set("title")} placeholder="Director of Classified Personnel" autoComplete="organization-title" />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="sr-org">District or agency</label>
        <input id="sr-org" value={form.org} onChange={set("org")} autoComplete="organization" required />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label htmlFor="sr-email">Work email</label>
          <input id="sr-email" type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
        </div>
        <div className="form-field">
          <label htmlFor="sr-phone">Phone (optional)</label>
          <input id="sr-phone" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="sr-volume">Classified hiring volume</label>
        <select id="sr-volume" value={form.volume} onChange={set("volume")}>
          <option value="">Choose one</option>
          {VOLUMES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="sr-message">What would you want a pilot to prove? (optional)</label>
        <textarea id="sr-message" rows={4} value={form.message} onChange={set("message")} />
      </div>
      {/* Honeypot: hidden from people, filled by bots. */}
      <div className="sr-hp" aria-hidden="true">
        <label htmlFor="sr-website">Website</label>
        <input id="sr-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
      </div>
      {state.error && <div className="form-result error">{state.error}</div>}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={state.busy}>
        {state.busy ? "Sending…" : "Request a pilot conversation"}
      </button>
      <p className="sr-fine">
        No commitment. You get a reply from a person, the security one-pager, and
        a 20-minute call if you want one. We never add you to a list.
      </p>
    </form>
  );
}

export default function SolAndRay() {
  usePageMeta({
    fullTitle: "Sol & Ray — Reference checks done by Ray. Decisions still made by you.",
    description:
      "Ray is an AI assistant that runs reference checks for school-district hiring offices: references opt in, Ray calls and records the answers word for word, your staff decide. Pilots for California Personnel Commissions.",
  });
  const home = isSolRayHost() ? "/" : "/sol-and-ray";

  return (
    <div className="sr">
      <header className="sr-nav">
        <div className="sr-wrap sr-nav-inner">
          <a className="sr-brand" href={home}>
            SOL &amp; RAY
            <small>Reference checks for public-agency hiring</small>
          </a>
          <nav className="sr-nav-links" aria-label="Sol & Ray">
            <a className="sr-nav-link sr-hide-sm" href="#how">How it works</a>
            <a className="sr-nav-link sr-hide-sm" href="#security">Security</a>
            <a className="sr-nav-link sr-hide-sm" href="#pilot-offer">Pilot</a>
            <a className="btn btn-primary btn-sm" href="#pilot">Request a pilot</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="sr-wrap sr-hero">
          <div>
            <div className="sr-eyebrow">For Personnel Commissions and HR offices</div>
            <h1 className="sr-title">
              Reference checks done by Ray.
              <br />
              <em>Decisions still made by you.</em>
            </h1>
            <p className="sr-lede">
              Ray is an AI assistant that takes the phone tag out of reference
              checks for classified hiring. References opt in, Ray calls and
              records what they say word for word, and your analysts read it and
              decide. Nothing is scored. Nobody is screened out by software.
            </p>
            <div className="lp-actions">
              <a className="btn btn-primary btn-lg" href="#pilot">Request a pilot</a>
              <a className="btn btn-outline btn-lg" href="#how">See how a call works</a>
            </div>
            <p className="sr-note">
              Built for California merit-system districts. 60 to 90 day pilots,
              priced under the state's direct-award threshold for school districts.
            </p>
          </div>

          <div className="sr-call" aria-label="Example of one reference call">
            <div className="sr-call-head">
              <span>One reference call</span>
              <span className="sr-live">Opted in · recorded</span>
            </div>
            <div className="sr-line sr-ray">
              <b>Ray</b>
              <span>Hi, this is Ray, an AI assistant calling on behalf of the district's Personnel Commission about a reference for Maria. This call is recorded. Is now still a good time?</span>
            </div>
            <div className="sr-line">
              <b>Ref.</b>
              <span>Yes, go ahead.</span>
            </div>
            <div className="sr-line sr-ray">
              <b>Ray</b>
              <span>Thank you. First question from the district: in what capacity did you work with Maria, and for how long?</span>
            </div>
            <div className="sr-line">
              <b>Ref.</b>
              <span>I supervised her for three years as a lead custodian at…</span>
            </div>
            <div className="sr-call-foot">
              Answers are transcribed verbatim and delivered to the Personnel Director's queue. No summary, no score.
            </div>
          </div>
        </section>

        <section className="sr-section" id="how">
          <div className="sr-wrap">
            <div className="sr-kicker">How it works</div>
            <h2>Invite, then call. Consent first, every time.</h2>
            <p className="sr-intro">
              The order matters. Because each reference opts in before Ray dials,
              every call already has the consent that California and federal
              calling and recording rules require.
            </p>
            <div className="sr-steps">
              {STEPS.map(([t, b], i) => (
                <div className="sr-step" key={t}>
                  <span className="sr-step-n">{i + 1}</span>
                  <h3>{t}</h3>
                  <p>{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sr-section">
          <div className="sr-wrap">
            <div className="sr-kicker">Scope</div>
            <h2>What Ray does, and what it will never do.</h2>
            <div className="sr-two" style={{ marginTop: 26 }}>
              <ul className="sr-list sr-yes">
                {YES.map(([t, b]) => (
                  <li key={t}>
                    <span>✓</span>
                    <span>
                      {t}
                      <small>{b}</small>
                    </span>
                  </li>
                ))}
              </ul>
              <ul className="sr-list sr-no">
                {NO.map(([t, b]) => (
                  <li key={t}>
                    <span>✕</span>
                    <span>
                      {t}
                      <small>{b}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="sr-section" id="security">
          <div className="sr-wrap">
            <div className="sr-kicker">For your IT and legal review</div>
            <h2>Commitments we put in writing.</h2>
            <p className="sr-intro">
              Reference checks are personnel records and, when a third party runs
              them, consumer-report law applies. The pilot is designed around that,
              not around getting past it.
            </p>
            <div className="sr-grid">
              {SECURITY.map(([t, b]) => (
                <div className="sr-cell" key={t}>
                  <h3>{t}</h3>
                  <p>{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sr-section" id="pilot-offer">
          <div className="sr-wrap">
            <div className="sr-band">
              <div>
                <div className="sr-kicker" style={{ color: "var(--gold)" }}>The pilot</div>
                <h2>One or two classifications. Sixty to ninety days. Real numbers.</h2>
                <p>
                  Pick your highest-volume classified roles. We configure your
                  question set and invitation text, onboard your analysts in an
                  hour, and report every two weeks on the metrics you choose.
                  At the end you get the data, a go or no-go decision, and every
                  record deleted within 30 days if you walk away.
                </p>
              </div>
              <div className="sr-band-facts">
                <div className="sr-fact">
                  <b>References reached</b>
                  <span>and checks completed per candidate</span>
                </div>
                <div className="sr-fact">
                  <b>Days from eligibility to a finished check</b>
                  <span>median, before and during</span>
                </div>
                <div className="sr-fact">
                  <b>Analyst hours returned</b>
                  <span>per week, measured together</span>
                </div>
                <div className="sr-fact">
                  <b>Consent and disclosure</b>
                  <span>100% of calls, on the record</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="sr-section">
          <div className="sr-wrap sr-form-wrap">
            <div>
              <div className="sr-kicker">Start here</div>
              <h2>Request a pilot conversation.</h2>
              <p className="sr-intro">
                Tell us who you are and roughly what your hiring load looks like.
                You get a reply from Isaak, the founder, within two business days,
                along with the security one-pager. If it fits, we book a 20-minute
                call with whoever needs to be in the room.
              </p>
              <p className="sr-intro">
                Prefer email? Write to{" "}
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
              </p>
            </div>
            <PilotForm />
          </div>
        </section>
      </main>

      <footer className="sr-footer">
        <div className="sr-wrap">
          <div className="sr-footer-links">
            <a href="#how">How it works</a>
            <a href="#security">Security</a>
            <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
            <a href="https://bankofsol.app/">Bank of Sol</a>
          </div>
          <p>
            Sol &amp; Ray builds software that reduces friction and enables
            control in public-agency operations. Ray is a software product; every
            employment decision stays with the district's staff. Sol &amp; Ray
            operates from California and is a product line of Bank of Sol.
          </p>
          <p>© {new Date().getFullYear()} Sol &amp; Ray</p>
        </div>
      </footer>
    </div>
  );
}
