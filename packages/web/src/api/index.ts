import type { RouterClient } from "@orpc/server";
import { createApp } from "./__core/app";
import { auth } from "./auth";
import { refreshJobs } from "./lib/ingest";
import { applications } from "./routes/applications";
import { companies, jobs } from "./routes/jobs";
import { ping } from "./routes/ping";
import { billing, resume } from "./routes/resume";

// API features are oRPC procedures, one file per feature in ./routes/,
// composed into this router — typed end-to-end via the clients
// (web: src/web/lib/api.ts, mobile: lib/api.ts).
export const router = {
  ping,
  jobs,
  companies,
  applications,
  resume,
  billing,
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);

// Better Auth handler.
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Job ingestion endpoint — driven by an external schedule after deploy.
app.post("/api/cron/refresh-jobs", async (c) => {
  try {
    const result = await refreshJobs({});
    return c.json({ ok: true, ...result }, 200);
  } catch (error) {
    return c.json({ ok: false, error: (error as Error).message }, 500);
  }
});

export default app;
