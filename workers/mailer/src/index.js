// bankofsol-mailer — the Worker that owns the `send_email` binding and ALL
// cron triggers (the compiled main Worker only exports `fetch`).
//
// RPC surface: `send(message)` — the site's EMAIL service binding lands here
// and is passed straight through to the real Email Sending binding, so
// functions/lib/email.js works unchanged in both Workers.
//
// Deploy explicitly with `npm run deploy:mailer` whenever this file or its
// imports (functions/lib/email.js, functions/lib/digest.js) change — it does
// NOT ride the main `npm run deploy`.
import { WorkerEntrypoint } from "cloudflare:workers";
import { runDailyCron } from "../../../functions/lib/digest.js";

export default class extends WorkerEntrypoint {
  // Passthrough to the real send_email binding. Message shape:
  // { to, from: {email, name}, replyTo, subject, html, text }
  async send(message) {
    return this.env.EMAIL.send(message);
  }

  async scheduled(controller) {
    // One daily cron (0 16 * * * = 8am PT): digest + booking reminders +
    // stale-pending sweep. Add new cron work by dispatching on
    // controller.cron when a second schedule appears.
    await runDailyCron(this.env, controller);
  }

  async fetch() {
    // No public surface (workers_dev: false); this answers service-binding
    // health checks only.
    return new Response("bankofsol-mailer", { status: 200 });
  }
}
