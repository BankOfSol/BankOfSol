import { useEffect } from "react";

// Per-page document titles for an SPA. Restores the site default on unmount.
// Keep in sync with the <title> in index.html — this overrides it at runtime.
const DEFAULT_TITLE =
  "Bank of Sol — Web Applications, Financial Automation & AI Consulting";

const DEFAULT_DESC =
  "We build web applications, financial automation systems, and practical AI consulting — senior work with no agency layers. Start with a call.";

// `fullTitle` skips the "· Bank of Sol" suffix (product-line pages such as
// Sol & Ray); `description` swaps the meta description for the page's stay.
export default function usePageMeta({ title, fullTitle, description } = {}) {
  useEffect(() => {
    document.title = fullTitle || (title ? `${title} · Bank of Sol` : DEFAULT_TITLE);
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", description || DEFAULT_DESC);
    return () => {
      document.title = DEFAULT_TITLE;
      if (meta) meta.setAttribute("content", DEFAULT_DESC);
    };
  }, [title, fullTitle, description]);
}
