import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite builds the React SPA into dist/. Cloudflare Pages then serves dist/
// plus the /functions directory as Pages Functions (the /api/* backend).
//
// `npm run dev` runs the UI alone on :5173 and proxies /api to a local
// `wrangler pages dev` instance (:8788) if you have one running. For full
// local testing (auth + D1 + R2) use `npm run cf:dev` instead.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8788",
    },
  },
});
