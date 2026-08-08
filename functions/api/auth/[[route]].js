import { getAuth } from "../../lib/auth.js";

// Better Auth handles everything under /api/auth/* (signup, login, verify,
// reset, change-email, session). Config lives in functions/lib/auth.js.
export const onRequest = ({ request, env }) => getAuth(env).handler(request);
