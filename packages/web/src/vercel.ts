// Vercel entrypoint. __server.ts is a long-running Bun.serve, which Vercel
// cannot host; here the same Hono app is exposed as a web-standard fetch
// handler and bundled into one Vercel function by deploy/vercel-build.ts.
// Static files and the SPA fallback are served by Vercel's CDN, not by this.
import app from "./api";

export default {
  fetch: (request: Request) => app.fetch(request),
};
