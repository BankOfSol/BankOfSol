import { useEffect } from "react";

// Per-page document titles for an SPA. Restores the site default on unmount.
// Keep in sync with the <title> in index.html — this overrides it at runtime.
const DEFAULT_TITLE =
  "Bank of Sol — Web Applications, Financial Automation & AI Consulting";

export default function usePageMeta({ title } = {}) {
  useEffect(() => {
    document.title = title ? `${title} · Bank of Sol` : DEFAULT_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}
