import { Link } from "react-router-dom";
import { srPath } from "../lib/host.js";

// Shared chrome for the Sol & Ray pages. Product-line brand, one primary
// action, and a footer that carries the notices a public-agency buyer looks
// for (privacy, accessibility, who we are).
export const SR_CONTACT_EMAIL = "Kaasi.serrano@gmail.com";

export function SrHeader({ cta = { href: srPath("/") + "#pilot", label: "Request a pilot" }, links = [] }) {
  return (
    <>
      <a className="sr-skip" href="#main">Skip to content</a>
      <header className="sr-nav">
        <div className="sr-wrap sr-nav-inner">
          <Link className="sr-brand" to={srPath("/")}>
            SOL &amp; RAY
            <small>Reference checks for public-agency hiring</small>
          </Link>
          <nav className="sr-nav-links" aria-label="Sol & Ray">
            {links.map((l) => (
              <a className="sr-nav-link sr-hide-sm" href={l.href} key={l.href}>
                {l.label}
              </a>
            ))}
            <a className="btn btn-primary btn-sm" href={cta.href}>
              {cta.label}
            </a>
          </nav>
        </div>
      </header>
    </>
  );
}

export function SrFooter() {
  return (
    <footer className="sr-footer">
      <div className="sr-wrap">
        <div className="sr-footer-links">
          <Link to={srPath("/")}>Overview</Link>
          <Link to={srPath("/privacy")}>Privacy &amp; accessibility</Link>
          <Link to={srPath("/searchlight")}>Built on Twilio</Link>
          <a href={`mailto:${SR_CONTACT_EMAIL}`}>Contact</a>
          <a href="https://bankofsol.app/">Bank of Sol</a>
        </div>
        <p>
          Sol &amp; Ray builds software that reduces friction and enables control
          in public-agency operations. Ray is a software product; every employment
          decision stays with the district's staff. Sol &amp; Ray operates from
          California as a product line of Bank of Sol, a technology and services
          company.
        </p>
        <p>
          We design to WCAG 2.1 Level AA and will provide an accessibility
          conformance report during procurement. No cookies, no trackers, no
          analytics on this site.
        </p>
        <p>© {new Date().getFullYear()} Sol &amp; Ray</p>
      </div>
    </footer>
  );
}
