import usePageMeta from "../lib/usePageMeta.js";
import { SrHeader, SrFooter, SR_CONTACT_EMAIL } from "../components/SrChrome.jsx";

// Privacy notice for the Sol & Ray site, written to California's online
// privacy statute (Business and Professions Code § 22575): categories
// collected, third parties, how to review or change, how changes are
// announced, effective date, Do Not Track, third-party tracking. Plus the
// accessibility statement a public-agency buyer expects.
export default function SolRayPrivacy() {
  usePageMeta({
    fullTitle: "Privacy and accessibility — Sol & Ray",
    description: "What the Sol & Ray website collects, what it does not, and how we approach accessibility.",
  });
  return (
    <div className="sr">
      <SrHeader links={[{ href: "#privacy", label: "Privacy" }, { href: "#accessibility", label: "Accessibility" }]} />
      <main id="main" className="sr-wrap sr-doc">
        <section id="privacy">
          <div className="sr-kicker">Privacy notice</div>
          <h1>What this site collects, and what it does not.</h1>
          <p className="sr-dim">Effective 2026-09-04. This notice covers solandray.com, solray.co, and the Sol &amp; Ray pages on bankofsol.app.</p>

          <h2>What we collect</h2>
          <p>
            Only what you type into the pilot-request form: your name, job title,
            district or agency, work email, phone number if you give it, a rough
            hiring volume, and your message. Our server also records the network
            address the form was sent from, which we keep only to limit repeated
            automated submissions.
          </p>

          <h2>Why we collect it</h2>
          <p>
            To reply to you about a pilot and to send one confirmation email. We
            do not add you to a mailing list, and we do not use your details for
            advertising.
          </p>

          <h2>Who else receives it</h2>
          <p>
            Cloudflare, which hosts this site, stores the database, and delivers
            our email. Nobody else. We do not sell or share personal information,
            and we have never done so.
          </p>

          <h2>Cookies, tracking, and "Do Not Track"</h2>
          <p>
            These pages set no cookies and load no analytics, advertising, or
            social-media scripts. No third party collects information about your
            activity across sites through this site. Because we do not track,
            browser "Do Not Track" and Global Privacy Control signals change
            nothing: there is nothing to opt out of.
          </p>

          <h2>How long we keep it</h2>
          <p>
            Pilot requests are kept while we are in conversation with your
            organization and deleted on request or once a pilot concludes or is
            declined. Our email log records the subject and delivery result of
            each message, never its contents.
          </p>

          <h2>Your choices and rights</h2>
          <p>
            Email <a href={`mailto:${SR_CONTACT_EMAIL}`}>{SR_CONTACT_EMAIL}</a> to
            see, correct, or delete what you sent us. We honor those requests
            for everyone, whether or not a particular privacy law applies to a
            company of our size. California residents may also exercise the
            rights in the California Consumer Privacy Act by the same email.
          </p>

          <h2>Children</h2>
          <p>
            This site is for adults working at public agencies. We do not
            knowingly collect information from anyone under 16.
          </p>

          <h2>Changes to this notice</h2>
          <p>
            If this notice changes materially, we will post the new version here
            with a new effective date. We do not email notice changes.
          </p>

          <h2>Product data is different</h2>
          <p>
            Data that Ray processes for a district under a pilot (candidate and
            reference names, recordings, transcripts) is governed by the written
            data processing agreement with that district, not by this website
            notice. That agreement sets retention, deletion, subprocessor, and
            breach-notice terms, and it is available to any district before a
            pilot starts.
          </p>
        </section>

        <section id="accessibility">
          <div className="sr-kicker">Accessibility</div>
          <h2>Built to WCAG 2.1 Level AA.</h2>
          <p>
            Public school districts are covered by the United States Department
            of Justice's 2024 web accessibility rule under Title II of the ADA,
            which sets WCAG 2.1 Level AA as the standard for the web content a
            public entity provides, including content provided by its vendors.
            We design Sol &amp; Ray's site and product to that standard: keyboard
            navigation, visible focus, labeled form fields, sufficient color
            contrast, text that scales, and no content that depends on motion.
          </p>
          <p>
            We will provide an accessibility conformance report for the product
            during procurement. If anything on this site is hard to use with
            assistive technology, email{" "}
            <a href={`mailto:${SR_CONTACT_EMAIL}`}>{SR_CONTACT_EMAIL}</a> and we
            will fix it and reply.
          </p>
        </section>
      </main>
      <SrFooter />
    </div>
  );
}
