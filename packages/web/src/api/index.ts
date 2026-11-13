import type { RouterClient } from "@orpc/server";
import { createApp } from "./__core/app";
import { auth } from "./auth";
import { runRefreshOnce, startJobScheduler } from "./lib/job-scheduler";
import { applications } from "./routes/applications";
import { companies, jobs } from "./routes/jobs";
import { ping } from "./routes/ping";
import { billing, resume } from "./routes/resume";
import { LOCAL_STORAGE, localPath, readObject, writeLocalObject } from "./lib/s3";

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

// Local-dev stand-in for the storage bucket when no S3 credentials are configured.
if (LOCAL_STORAGE) {
  app.put("/api/local-files/*", async (c) => {
    const key = c.req.path.slice("/api/local-files/".length);
    if (!key.startsWith("resumes/") || !localPath(key)) return c.text("Invalid key", 400);
    await writeLocalObject(key, new Uint8Array(await c.req.arrayBuffer()));
    return c.body(null, 200);
  });
  app.get("/api/local-files/*", async (c) => {
    const key = decodeURIComponent(c.req.path.slice("/api/local-files/".length));
    if (!localPath(key)) return c.text("Invalid key", 400);
    try {
      const bytes = await readObject(key);
      const type = key.endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf";
      return c.body(bytes, 200, { "Content-Type": type });
    } catch {
      return c.text("Not found", 404);
    }
  });
}

// Pull new jobs every hour while the server runs.
startJobScheduler();

// Manual job pull. Needs CRON_SECRET in production; open locally when it's unset.
// GET as well as POST because Vercel Cron only sends GET, with the same
// `Authorization: Bearer $CRON_SECRET` header.
app.on(["GET", "POST"], "/api/cron/refresh-jobs", async (c) => {
  const secret = process.env.CRON_SECRET;
  const allowed = secret
    ? c.req.header("authorization") === `Bearer ${secret}`
    : process.env.NODE_ENV !== "production";
  if (!allowed) return c.json({ ok: false, error: "Unauthorized" }, 401);

  const outcome = await runRefreshOnce("http");
  if (outcome.ok) return c.json({ ok: true, ...outcome.result }, 200);
  if (outcome.busy) return c.json({ ok: false, error: "A refresh is already running." }, 409);
  return c.json({ ok: false, error: outcome.error }, 500);
});

export default app;
