import { useEffect } from "react";

// Per-page document titles for an SPA. Restores the site default on unmount.
const DEFAULT_TITLE = "Bank of Sol — Solana Custody, Crypto Payments & Consulting";

export default function usePageMeta({ title } = {}) {
  useEffect(() => {
    document.title = title ? `${title} · Bank of Sol` : DEFAULT_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title]);
}
