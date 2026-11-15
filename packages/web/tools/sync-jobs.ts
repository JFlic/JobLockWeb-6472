/**
 * The hourly job sync, run by .github/workflows/sync-jobs.yml.
 *
 * It runs on a GitHub runner instead of inside the Vercel function because
 * ~10k boards take minutes, past the function's 300s limit, and the Hobby
 * plan's monthly CPU allowance would not cover it every hour. A public repo's
 * Actions minutes are free.
 *
 *   DATABASE_URL=... DATABASE_AUTH_TOKEN=... bun tools/sync-jobs.ts
 *
 * Optional env:
 *   JOB_SYNC_CONCURRENCY  boards fetched at once (default 16)
 *   JOB_SYNC_CACHE        file holding rejected-posting stamps between runs
 *   JOB_SYNC_PRUNE=1      also delete jobs closed 90+ days (done daily at 04 UTC anyway)
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../src/api/database";
import { pruneClosedJobs, refreshJobs, type BoardSeed, type RejectCache } from "../src/api/lib/ingest";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

/**
 * Indexes the sync and the board depend on, applied idempotently. Kept here
 * rather than relying on someone running drizzle-kit push against production;
 * mirrors schema.ts.
 */
async function ensureIndexes() {
  await db.run(sql`create index if not exists jobs_company_idx on jobs (company_id, closed_at)`);
  // See schema.ts: this index made SQLite sort every open job for each page.
  await db.run(sql`drop index if exists jobs_closed_at_idx`);
}

async function loadRejects(file: string | undefined): Promise<RejectCache> {
  if (!file) return new Map();
  try {
    const data = JSON.parse(await readFile(file, "utf8")) as Record<string, number>;
    return new Map(Object.entries(data).filter(([, v]) => typeof v === "number"));
  } catch {
    return new Map();
  }
}

const started = Date.now();
const boards = JSON.parse(
  await readFile(path.join(import.meta.dir, "..", "data", "boards.json"), "utf8"),
) as BoardSeed[];
const cacheFile = process.env.JOB_SYNC_CACHE;
const rejects = await loadRejects(cacheFile);

await ensureIndexes();
const result = await refreshJobs({
  boards,
  rejects,
  concurrency: Number(process.env.JOB_SYNC_CONCURRENCY) || 16,
});

if (cacheFile) {
  await writeFile(cacheFile, JSON.stringify(Object.fromEntries(rejects)));
}

let pruned = 0;
if (process.env.JOB_SYNC_PRUNE === "1" || new Date().getUTCHours() === 4) {
  pruned = await pruneClosedJobs(90);
}

const seconds = Math.round((Date.now() - started) / 1000);
console.log(
  `Synced ${result.companies} boards in ${seconds}s: +${result.inserted} new, ${result.updated} updated, ` +
    `${result.unchanged} unchanged, ${result.closed} closed, ${result.gone} boards gone, ` +
    `${pruned} pruned, ${result.errors.length} errors, ${rejects.size} cached rejects`,
);
for (const e of result.errors.slice(0, 25)) console.log(`  ${e.company}: ${e.error}`);
if (result.errors.length > 25) console.log(`  ...and ${result.errors.length - 25} more`);

// Individual boards fail all the time (timeouts, a 500); only a run where
// almost nothing worked means something is actually broken.
if (result.companies === 0 || result.errors.length > result.companies) {
  console.error("Most boards failed; marking the run as failed.");
  process.exit(1);
}
process.exit(0);
