import { sql } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { refreshJobs, type IngestResult } from "./ingest";

const STARTUP_DELAY_MS = 30_000;

// Lives on globalThis so dev module reloads share one flag with the running timer.
const shared = globalThis as { __jobRefreshRunning?: boolean; __jobSchedulerStarted?: boolean };

export type RefreshOutcome =
  | { ok: true; result: IngestResult; durationMs: number }
  | { ok: false; busy: true }
  | { ok: false; busy: false; error: string };

/** Run one job pull. Never throws, and never runs two pulls at once. */
export async function runRefreshOnce(source: "schedule" | "http"): Promise<RefreshOutcome> {
  if (shared.__jobRefreshRunning) return { ok: false, busy: true };
  shared.__jobRefreshRunning = true;
  const started = Date.now();
  try {
    const result = await refreshJobs({});
    const durationMs = Date.now() - started;
    console.log(
      `[jobs] refresh (${source}) done in ${Math.round(durationMs / 1000)}s: ` +
        `${result.companies} companies, +${result.inserted} new, ${result.updated} updated, ` +
        `${result.closed} closed, ${result.skipped} skipped, ${result.errors.length} errors`,
    );
    for (const e of result.errors) console.warn(`[jobs]   ${e.company}: ${e.error}`);
    return { ok: true, result, durationMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[jobs] refresh (${source}) failed: ${message}`);
    return { ok: false, busy: false, error: message };
  } finally {
    shared.__jobRefreshRunning = false;
  }
}

async function lastSyncedAt(): Promise<number | null> {
  const [row] = await db
    .select({ at: sql<number | null>`max(${schema.companies.lastSyncedAt})` })
    .from(schema.companies);
  return row?.at ? row.at * 1000 : null;
}

/**
 * Pull new jobs on a fixed interval (default hourly) for as long as the server
 * runs. Safe to call more than once: dev reloads the API module on every edit.
 */
export function startJobScheduler() {
  if (shared.__jobSchedulerStarted) return;
  if (process.env.JOB_REFRESH_ENABLED === "false") return;
  // Serverless instances freeze between requests, so a timer here would fire
  // at random inside some unrelated invocation. Vercel Cron drives it instead.
  if (process.env.VERCEL) return;
  shared.__jobSchedulerStarted = true;

  const minutes = Number(process.env.JOB_REFRESH_INTERVAL_MINUTES) || 60;
  const intervalMs = Math.max(1, minutes) * 60_000;

  void (async () => {
    let firstDelay = STARTUP_DELAY_MS;
    try {
      const last = await lastSyncedAt();
      if (last) firstDelay = Math.max(STARTUP_DELAY_MS, last + intervalMs - Date.now());
    } catch {
      // Database not reachable yet; fall back to the short startup delay.
    }

    console.log(
      `[jobs] auto refresh on: every ${minutes} min, next in ${Math.round(firstDelay / 60_000)} min`,
    );

    const first = setTimeout(() => {
      void runRefreshOnce("schedule");
      setInterval(() => void runRefreshOnce("schedule"), intervalMs).unref?.();
    }, firstDelay);
    first.unref?.();
  })();
}
