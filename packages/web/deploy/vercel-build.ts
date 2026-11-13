/**
 * Produces a Vercel Build Output API tree (.vercel/output) by hand instead of
 * relying on framework detection. Detection is the wrong fit here: the repo has
 * Hono as a dependency and a src/server.ts, so Vercel's Hono preset would pick
 * the Bun.serve entry, and @vercel/node's per-file TS transpile leaves the
 * extensionless ESM imports in src/api unresolvable at runtime. One bundled
 * function and a static dir sidestep both.
 *
 * Run from packages/web: `bun deploy/vercel-build.ts`.
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { $ } from "bun";

const webRoot = path.resolve(import.meta.dirname, "..");
const out = path.join(webRoot, ".vercel/output");
const fn = path.join(out, "functions/api.func");

await rm(out, { recursive: true, force: true });

await $`bunx vite build`.cwd(webRoot);
await cp(path.join(webRoot, "dist"), path.join(out, "static"), { recursive: true });

const result = await Bun.build({
  entrypoints: [path.join(webRoot, "src/vercel.ts")],
  outdir: fn,
  naming: "index.mjs",
  target: "node",
  format: "esm",
  // Bun inlines process.env.NODE_ENV at bundle time, and left to itself picks
  // "development" — which silently opened the cron route without a secret and
  // would honour LOCAL_NO_AUTH. This bundle only ever runs on Vercel.
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [
    {
      // The default @libsql/client entry pulls in the native `libsql` addon for
      // file: URLs, which cannot be bundled. Production only ever talks to
      // Turso over libsql://, which the pure-JS web client covers.
      name: "libsql-web",
      setup(build) {
        build.onResolve({ filter: /^@libsql\/client$/ }, () => ({
          path: Bun.resolveSync("@libsql/client/web", webRoot),
        }));
      },
    },
  ],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

await writeFile(
  path.join(fn, ".vc-config.json"),
  JSON.stringify({
    runtime: "nodejs22.x",
    handler: "index.mjs",
    launcherType: "Nodejs",
    supportsResponseStreaming: true,
    // The cron job pull takes ~30s against 48 companies; leave headroom.
    maxDuration: 300,
  }),
);
await writeFile(path.join(fn, "package.json"), JSON.stringify({ type: "module" }));

await writeFile(
  path.join(out, "config.json"),
  JSON.stringify({
    version: 3,
    routes: [
      { src: "^/api(/.*)?$", dest: "/api" },
      { handle: "filesystem" },
      // Client-side routes (wouter) all render from index.html.
      { src: "/.*", dest: "/index.html" },
    ],
    crons: [{ path: "/api/cron/refresh-jobs", schedule: "0 12 * * *" }],
  }),
);

console.log(`Vercel output written to ${path.relative(process.cwd(), out)}`);
