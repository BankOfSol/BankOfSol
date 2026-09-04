import { Link } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";
import { srPath } from "../lib/host.js";
import { SrHeader, SrFooter, SR_CONTACT_EMAIL } from "../components/SrChrome.jsx";

// The Twilio AI Startup Searchlight slice. Written to the program's own
// judging dimensions (creativity, long-term impact, market impact, technical
// impact) and its demo guidance ("one story, one persona, one outcome"; make
// the AI decision moment obvious; make Twilio's role unmistakable; include a
// lightweight architecture diagram). Facts only: no traction we don't have,
// no vendor partnership claims. Prices in the credits section are Twilio's
// published US pay-as-you-go rates, verified 2026-09-04.
//
// Sol: set DEMO_URL to the demo video before submitting; until then the page
// says the demo is available on request.
const DEMO_URL = "";

const TWILIO_RATES = {
  relay: 0.07, // ConversationRelay, per minute
  outbound: 0.014, // outbound to US numbers, per minute
  recording: 0.0025, // recording, per minute
};
const PER_MIN = TWILIO_RATES.relay + TWILIO_RATES.outbound + TWILIO_RATES.recording;
const CREDIT = 5000;
const MINUTES = Math.floor(CREDIT / PER_MIN);
const CALLS = Math.floor(MINUTES / 5);

const CRITERIA = [
  {
    k: "Creativity",
    t: "Consent is the feature, not the fine print.",
    b: "Most AI callers optimize for reach. Ray inverts it: the reference is invited first, picks the time, and the AI voice introduces itself as an AI on a recorded line. That single design choice is what makes an automated reference call lawful in California, and it is what makes references willing to talk.",
  },
  {
    k: "Long-term impact",
    t: "A human decision, with the phone tag removed.",
    b: "Ray never scores, ranks, or summarizes a person into a grade. It captures what a reference said, verbatim, and hands it to the analyst who decides. That keeps a hiring step humane and reviewable while returning the hours that today go to voicemail.",
  },
  {
    k: "Market impact",
    t: "Public-agency hiring is large, slow, and unserved.",
    b: "California's merit-system school districts hire classified staff through Personnel Commissions with small teams and statutory process. Applicant-tracking tools stop at the application; the reference call is still done by hand. Ray is built for that gap, then for every agency that checks references the same way.",
  },
  {
    k: "Technical impact",
    t: "Twilio does the telephony; Ray does the judgment calls.",
    b: "Programmable Voice places the call, ConversationRelay streams speech both ways over a WebSocket to Ray's orchestrator, Messaging handles opt-in and reminders on a registered 10DLC number, and Twilio recording captures the audio. Ray's model runs in zero-retention mode and decides only how to ask, when to listen, and when to hand off.",
  },
];

const DECISIONS = [
  ["Ray decides", ["When the reference has finished answering and it is time to move to the next question", "Whether an answer actually addressed the district's question or needs one clarifying follow-up", "When a reference is uncomfortable and should be offered a human instead", "When to stop: consent withdrawn, time window over, or the question set complete"]],
  ["Ray never decides", ["Whether the candidate is a good hire", "Whether an answer is positive or negative", "Which candidates the analyst should look at first", "Anything that is not on the district's question list"]],
];

const STACK = [
  ["Twilio Messaging (10DLC)", "Invitation and reminder texts in the district's name; STOP honored instantly."],
  ["Twilio Programmable Voice", "Outbound call at the reference's chosen time, from a number registered to the district's campaign."],
  ["Twilio ConversationRelay", "Real-time speech-to-text and text-to-speech, streamed over a WebSocket to Ray."],
  ["Twilio call recording", "The recording the reference consented to; deleted after 30 days."],
  ["Ray orchestrator", "Holds the district's question set, runs the consent script, calls the model, writes the transcript."],
  ["LLM, zero retention", "Turn-by-turn understanding and phrasing; no training on district data."],
  ["District workspace", "Microsoft sign-in, role-based access, audit log of every view; US-only storage."],
];

function Diagram() {
  // Lightweight architecture diagram, inline SVG so it scales and reads in
  // both print and screen readers (title + desc).
  const box = (x, y, w, h, label, sub, cls = "") => (
    <g className={`sr-dg-box ${cls}`} key={label}>
      <rect x={x} y={y} width={w} height={h} rx="10" />
      <text x={x + w / 2} y={y + 26} textAnchor="middle" className="sr-dg-t">{label}</text>
      {sub && <text x={x + w / 2} y={y + 46} textAnchor="middle" className="sr-dg-s">{sub}</text>}
    </g>
  );
  return (
    <svg viewBox="0 0 960 380" role="img" aria-labelledby="dg-title dg-desc" className="sr-diagram">
      <title id="dg-title">Ray architecture on Twilio</title>
      <desc id="dg-desc">
        A district analyst's workspace sends an invitation through Twilio Messaging. The reference opts in and picks a time. Twilio Programmable Voice places the call; ConversationRelay streams speech to and from Ray's orchestrator, which calls a zero-retention language model. The call is recorded by Twilio. The transcript and recording go to the district's Personnel Director queue. Two consent gates sit before the call: the candidate's written authorization and the reference's opt-in.
      </desc>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="sr-dg-arr" />
        </marker>
      </defs>
      {box(20, 40, 200, 64, "District workspace", "SSO · audit log · US-only")}
      {box(280, 40, 200, 64, "Twilio Messaging", "10DLC invitation · STOP", "tw")}
      {box(540, 40, 200, 64, "Reference opts in", "picks a time · consent recorded", "gate")}
      {box(800, 40, 140, 64, "Twilio Voice", "outbound call", "tw")}
      {box(800, 170, 140, 64, "ConversationRelay", "STT · TTS · WebSocket", "tw")}
      {box(540, 170, 200, 64, "Ray orchestrator", "question set · consent script")}
      {box(280, 170, 200, 64, "LLM, zero retention", "no training on data")}
      {box(800, 296, 140, 64, "Twilio recording", "deleted after 30 days", "tw")}
      {box(540, 296, 200, 64, "Transcript, verbatim", "no score · no summary")}
      {box(20, 296, 460, 64, "Personnel Director queue", "analysts read and decide · human callback list", "out")}
      {box(20, 170, 200, 64, "Candidate authorization", "stand-alone disclosure signed", "gate")}
      <g className="sr-dg-lines">
        <line x1="220" y1="72" x2="280" y2="72" markerEnd="url(#arr)" />
        <line x1="480" y1="72" x2="540" y2="72" markerEnd="url(#arr)" />
        <line x1="740" y1="72" x2="800" y2="72" markerEnd="url(#arr)" />
        <line x1="870" y1="104" x2="870" y2="170" markerEnd="url(#arr)" />
        <line x1="800" y1="202" x2="740" y2="202" markerEnd="url(#arr)" markerStart="url(#arr)" />
        <line x1="540" y1="202" x2="480" y2="202" markerEnd="url(#arr)" markerStart="url(#arr)" />
        <line x1="870" y1="234" x2="870" y2="296" markerEnd="url(#arr)" />
        <line x1="640" y1="234" x2="640" y2="296" markerEnd="url(#arr)" />
        <line x1="540" y1="328" x2="480" y2="328" markerEnd="url(#arr)" />
        <line x1="120" y1="104" x2="120" y2="170" />
        <line x1="220" y1="202" x2="540" y2="202" strokeDasharray="4 4" />
      </g>
    </svg>
  );
}

export default function SolRaySearchlight() {
  usePageMeta({
    fullTitle: "Ray, built on Twilio — Sol & Ray for the Twilio AI Startup Searchlight",
    description:
      "How Ray runs consent-first reference checks for public-agency hiring on Twilio Programmable Voice, ConversationRelay, and Messaging, and why it belongs in the Breakthrough Builders track.",
  });

  return (
    <div className="sr">
      <SrHeader
        links={[
          { href: "#story", label: "The story" },
          { href: "#decision", label: "The AI decision" },
          { href: "#architecture", label: "Architecture" },
          { href: "#criteria", label: "Why Ray" },
        ]}
        cta={{ href: "#demo", label: "See the demo" }}
      />

      <main id="main">
        <section className="sr-wrap sr-hero sr-hero-one">
          <div>
            <div className="sr-eyebrow">Twilio AI Startup Searchlight 2026 · Breakthrough Builders</div>
            <h1 className="sr-title">
              An AI voice agent that asks permission first.
              <br />
              <em>Built on Twilio.</em>
            </h1>
            <p className="sr-lede">
              Ray runs reference checks for school-district hiring offices. It
              invites each reference over Twilio Messaging, calls them at the time
              they chose over Programmable Voice, talks through ConversationRelay,
              and hands the district a verbatim transcript. The AI decides how to
              ask. People decide who to hire.
            </p>
            <div className="lp-actions">
              <a className="btn btn-primary btn-lg" href="#demo">See the demo</a>
              <Link className="btn btn-outline btn-lg" to={srPath("/")}>What districts see</Link>
            </div>
            <p className="sr-note">
              Founder-led and bootstrapped, from California. First target customer:
              a California school district's Personnel Commission.
            </p>
          </div>
          <div className="sr-pill-stack" aria-label="Twilio products used">
            {["Programmable Voice", "ConversationRelay", "Messaging · 10DLC", "Call recording"].map((p) => (
              <div className="sr-pill" key={p}>
                <span className="sr-pill-dot" aria-hidden="true" />
                {p}
              </div>
            ))}
          </div>
        </section>

        <section className="sr-section" id="story">
          <div className="sr-wrap">
            <div className="sr-kicker">One story · one persona · one outcome</div>
            <h2>Jennifer has 40 eligibles and three references each.</h2>
            <div className="sr-two">
              <div className="sr-prose">
                <p>
                  Jennifer is a personnel analyst at a California school district.
                  An eligibility list for instructional assistants just closed with
                  40 names on it. Before any of them can start in a classroom, she
                  has to reach 120 references, ask the district's seven questions,
                  and write down what each one said. Most references are working;
                  most calls go to voicemail; the average check takes days of
                  callbacks, and the classroom waits.
                </p>
                <p>
                  With Ray, Jennifer loads the list and the district's questions.
                  Each reference gets a text in the district's name and picks a
                  15-minute window. Ray calls in that window, introduces itself as
                  an AI on a recorded line, asks the seven questions, and follows
                  up once if an answer wandered. By the next morning Jennifer's
                  queue has verbatim answers for the references who opted in, and a
                  short callback list of the ones who wanted a person.
                </p>
                <p>
                  <strong>The outcome:</strong> Jennifer reads and decides. The
                  district's process is unchanged. The phone tag is gone.
                </p>
              </div>
              <aside className="sr-call">
                <div className="sr-call-head">
                  <span>The AI decision moment</span>
                  <span className="sr-live">live · ConversationRelay</span>
                </div>
                <div className="sr-line"><b>Ref.</b><span>She was… fine, I guess. Reliable. I mean, she was there every day, that's for sure.</span></div>
                <div className="sr-line sr-ray"><b>Ray</b><span>Thank you. The district's question was about attendance and punctuality specifically. Was there anything about her attendance you'd want the district to know?</span></div>
                <div className="sr-line"><b>Ref.</b><span>No, honestly, attendance was never a problem. Never late.</span></div>
                <div className="sr-line sr-ray"><b>Ray</b><span>Got it, thank you. Next question from the district…</span></div>
                <div className="sr-call-foot">
                  Ray decided the answer had drifted and asked one clarifying follow-up tied to the district's own question. It recorded both answers verbatim and drew no conclusion from either.
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className="sr-section" id="decision">
          <div className="sr-wrap">
            <div className="sr-kicker">Where the AI is, and where it is not</div>
            <h2>Make the decision moment obvious.</h2>
            <div className="sr-two" style={{ marginTop: 22 }}>
              {DECISIONS.map(([title, items], i) => (
                <div className={`sr-decide ${i ? "sr-decide-no" : "sr-decide-yes"}`} key={title}>
                  <h3>{title}</h3>
                  <ul>
                    {items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sr-section" id="architecture">
          <div className="sr-wrap">
            <div className="sr-kicker">Architecture</div>
            <h2>Twilio's role is unmistakable.</h2>
            <p className="sr-intro">
              Every channel the reference touches is Twilio. Everything Ray adds
              sits behind two consent gates and in front of a human queue.
            </p>
            <div className="sr-diagram-wrap">
              <Diagram />
            </div>
            <div className="sr-grid" style={{ marginTop: 26 }}>
              {STACK.map(([t, b]) => (
                <div className="sr-cell" key={t}>
                  <h3>{t}</h3>
                  <p>{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sr-section" id="criteria">
          <div className="sr-wrap">
            <div className="sr-kicker">Against the judging criteria</div>
            <h2>Why Ray belongs in Breakthrough Builders.</h2>
            <div className="sr-criteria">
              {CRITERIA.map((c) => (
                <article className="sr-crit" key={c.k}>
                  <div className="sr-crit-k">{c.k}</div>
                  <h3>{c.t}</h3>
                  <p>{c.b}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sr-section" id="production">
          <div className="sr-wrap">
            <div className="sr-kicker">Path to production</div>
            <h2>The compliance work is done before the first call.</h2>
            <div className="sr-grid">
              {[
                ["TCPA consent, captured", "AI-generated voices are 'artificial' under the TCPA (FCC ruling, February 2024). Ray calls only references who opted in, so prior express consent exists for every call and text."],
                ["California call rules, scripted", "Live introduction, purpose, callback number, AI-voice disclosure, and recording notice on every call (Public Utilities Code §§ 2872, 2874; Penal Code § 632). Calls only 9 a.m. to 9 p.m. Pacific."],
                ["Consumer-report law, designed in", "Third-party reference checks are investigative consumer reports under FCRA and California's ICRAA. The product collects the candidate's stand-alone authorization first and supports the district's disclosure and adverse-action duties."],
                ["Data handling a district can sign", "US-only storage, encryption at rest and in transit, district SSO, audit log of every record view, subprocessors on no-training and zero-retention terms, 30-day deletion on exit, written data-processing agreement."],
                ["Accessibility", "Built to WCAG 2.1 AA, the standard the ADA's 2024 rule sets for public entities and the vendors that serve them."],
                ["Go-to-market", "60 to 90 day pilots priced under California's direct-award threshold for school districts, so a Personnel Commission can start without a formal bid."],
              ].map(([t, b]) => (
                <div className="sr-cell" key={t}>
                  <h3>{t}</h3>
                  <p>{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sr-section" id="credits">
          <div className="sr-wrap">
            <div className="sr-band">
              <div>
                <div className="sr-kicker sr-kicker-gold">What the credits do</div>
                <h2>$5,000 in Twilio credits is roughly {MINUTES.toLocaleString()} call-minutes.</h2>
                <p>
                  At Twilio's published US rates (ConversationRelay ${TWILIO_RATES.relay.toFixed(2)}/min,
                  outbound ${TWILIO_RATES.outbound.toFixed(3)}/min, recording ${TWILIO_RATES.recording.toFixed(4)}/min,
                  verified 2026-09-04), that is about {CALLS.toLocaleString()} five-minute
                  reference calls: enough to run two full district pilots end to end
                  and publish the results, with the OpenAI credits covering the
                  zero-retention model calls behind them.
                </p>
              </div>
              <div className="sr-band-facts">
                <div className="sr-fact"><b>Pilot one</b><span>one high-volume classification, 60 days, metrics every two weeks</span></div>
                <div className="sr-fact"><b>Pilot two</b><span>a second district, same playbook, to show the pattern repeats</span></div>
                <div className="sr-fact"><b>Published</b><span>consent rates, completion rates, hours returned; the numbers districts ask for</span></div>
                <div className="sr-fact"><b>Twilio Ventures</b><span>the relationship we want most: a partner who knows voice</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="sr-section" id="demo">
          <div className="sr-wrap sr-two">
            <div>
              <div className="sr-kicker">The demo</div>
              <h2>One workflow, end to end.</h2>
              <p className="sr-intro">
                Invitation text → opt-in → the call over ConversationRelay, with the
                AI-voice and recording disclosures audible → one clarifying follow-up
                → the verbatim transcript landing in the analyst's queue. Twilio's
                role is on screen the whole way.
              </p>
              {DEMO_URL ? (
                <a className="btn btn-primary btn-lg" href={DEMO_URL} target="_blank" rel="noreferrer">
                  Watch the demo
                </a>
              ) : (
                <p className="sr-intro">
                  The demo video is available on request:{" "}
                  <a href={`mailto:${SR_CONTACT_EMAIL}?subject=Ray%20demo`}>{SR_CONTACT_EMAIL}</a>.
                </p>
              )}
            </div>
            <div className="sr-founder">
              <div className="sr-kicker">Founder</div>
              <h3>Isaak Serrano</h3>
              <p className="sr-dim">
                Founder, Sol &amp; Ray. Builds software for public agencies and small
                teams from Los Angeles County, including the platform this page runs
                on. Sol &amp; Ray's thesis: AI that takes the friction out of the
                job, not the person out of the job.
              </p>
              <p className="sr-dim">
                <a href={`mailto:${SR_CONTACT_EMAIL}`}>{SR_CONTACT_EMAIL}</a>
              </p>
            </div>
          </div>
        </section>
      </main>

      <SrFooter />
    </div>
  );
}
