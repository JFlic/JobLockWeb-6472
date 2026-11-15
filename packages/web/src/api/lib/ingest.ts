import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "../database";
import * as schema from "../database/schema";
import {
  BoardGoneError,
  buildSummary,
  classifyLevel,
  detectRemote,
  detectVisaSponsorship,
  fetchBoard,
  fetchDescriptions,
  isSoftwareRole,
  levelFromTitle,
  type RawPosting,
} from "./ats";
import { SEED_COMPANIES, logoFor } from "./seed-companies";

export interface IngestResult {
  companies: number;
  inserted: number;
  updated: number;
  unchanged: number;
  closed: number;
  skipped: number;
  /** Boards that answered 404 and were switched off. */
  gone: number;
  /** Companies left for the next run because the deadline came first. */
  deferred: number;
  errors: { company: string; error: string }[];
}

export interface BoardSeed {
  name: string;
  ats: string;
  slug: string;
  website?: string | null;
}

/**
 * Neutral titles ("Software Engineer") that the description ruled out, keyed
 * by sourceId, with the posting's timestamp when it was judged. Remembering
 * them is what lets a Greenhouse board be skipped on the next run without
 * downloading every description again just to reject the same postings.
 * The sync script persists it between runs; without it a run is only slower.
 */
export type RejectCache = Map<string, number>;

export interface RefreshOptions {
  limit?: number;
  companyId?: number;
  /** Boards fetched at once. */
  concurrency?: number;
  /** Stop starting new boards after this time (ms epoch); the rest wait for the next run. */
  deadline?: number;
  rejects?: RejectCache;
  /** Extra boards to make sure exist (the imported list in data/boards.json). */
  boards?: BoardSeed[];
}

/** Insert boards that aren't in the database yet. Never reactivates a board switched off as gone. */
export async function ensureCompanies(boards: BoardSeed[] = []): Promise<number> {
  const existing = await db
    .select({ atsType: schema.companies.atsType, boardSlug: schema.companies.boardSlug })
    .from(schema.companies);
  const known = new Set(existing.map((c) => `${c.atsType}:${c.boardSlug.toLowerCase()}`));

  const wanted: BoardSeed[] = [
    ...SEED_COMPANIES.map((c) => ({ name: c.name, ats: c.atsType, slug: c.boardSlug, website: c.website })),
    ...boards,
  ];
  const missing: BoardSeed[] = [];
  for (const b of wanted) {
    const key = `${b.ats}:${b.slug.toLowerCase()}`;
    if (known.has(key)) continue;
    known.add(key);
    missing.push(b);
  }

  // SQLite caps bound parameters per statement; 200 rows x 5 columns stays well under.
  for (let i = 0; i < missing.length; i += 200) {
    await db
      .insert(schema.companies)
      .values(
        missing.slice(i, i + 200).map((b) => ({
          name: b.name,
          atsType: b.ats,
          boardSlug: b.slug,
          website: b.website ?? null,
          logoUrl: logoFor(b.website ?? null),
        })),
      )
      .onConflictDoNothing();
  }
  return missing.length;
}

/** @deprecated kept for callers that only want the hand-picked seed set. */
export const ensureSeedCompanies = () => ensureCompanies();

type JobRow = typeof schema.jobs.$inferInsert;

interface KnownJob {
  id: number;
  companyId: number;
  title: string;
  location: string | null;
  remote: boolean;
  level: string;
  sponsorsVisa: boolean;
  applyUrl: string;
  summary: string | null;
  postedAt: Date | null;
  closedAt: Date | null;
}

/** Every stored job in one query: one read per row, instead of one query per company. */
async function loadKnownJobs(): Promise<Map<string, KnownJob>> {
  const rows = await db
    .select({
      id: schema.jobs.id,
      sourceId: schema.jobs.sourceId,
      companyId: schema.jobs.companyId,
      title: schema.jobs.title,
      location: schema.jobs.location,
      remote: schema.jobs.remote,
      level: schema.jobs.level,
      sponsorsVisa: schema.jobs.sponsorsVisa,
      applyUrl: schema.jobs.applyUrl,
      summary: schema.jobs.summary,
      postedAt: schema.jobs.postedAt,
      closedAt: schema.jobs.closedAt,
    })
    .from(schema.jobs);
  return new Map(rows.map(({ sourceId, ...rest }) => [sourceId, rest]));
}

const ms = (d: Date | null | undefined) => (d ? d.getTime() : null);

/**
 * Whether a fresh row differs from what's stored in anything the board shows.
 * Writes are the scarce resource (Turso's free tier counts every row written),
 * and most postings don't change from one hour to the next.
 */
function changed(known: KnownJob, row: JobRow): boolean {
  return (
    known.closedAt !== null ||
    known.title !== row.title ||
    known.location !== row.location ||
    known.remote !== row.remote ||
    known.level !== row.level ||
    known.sponsorsVisa !== row.sponsorsVisa ||
    known.applyUrl !== row.applyUrl ||
    known.summary !== row.summary ||
    // Timestamps are stored in whole seconds.
    Math.floor((ms(known.postedAt) ?? 0) / 1000) !== Math.floor((ms(row.postedAt as Date | null) ?? 0) / 1000)
  );
}

function toRow(companyId: number, p: RawPosting, description: string): JobRow {
  return {
    companyId,
    sourceId: p.sourceId,
    title: p.title,
    location: p.location,
    remote: detectRemote(p.location, description),
    level: classifyLevel(p.title, description),
    sponsorsVisa: detectVisaSponsorship(description),
    applyUrl: p.applyUrl,
    summary: buildSummary(description),
    descriptionText: description.slice(0, 12000),
    postedAt: p.postedAt,
    closedAt: null,
  };
}

type Company = typeof schema.companies.$inferSelect;

async function syncCompany(
  company: Company,
  known: Map<string, KnownJob>,
  rejects: RejectCache,
  result: IngestResult,
) {
  const listed = await fetchBoard(company.atsType, company.boardSlug);
  const software = listed.filter((p) => isSoftwareRole(p.title));
  result.skipped += listed.length - software.length;

  // Which postings need a full look. A stored job whose timestamp hasn't moved
  // is unchanged; so is a neutral title already rejected at this timestamp.
  // Senior titles are settled by the title alone.
  const candidates: RawPosting[] = [];
  const stillOpen = new Set<string>();
  for (const p of software) {
    const fromTitle = levelFromTitle(p.title);
    if (fromTitle === "other") {
      result.skipped += 1;
      continue;
    }
    const k = known.get(p.sourceId);
    const stamp = ms(p.postedAt) ?? 0;
    if (p.descriptionText === null && k && k.closedAt === null && k.companyId === company.id) {
      if (Math.floor((ms(k.postedAt) ?? 0) / 1000) === Math.floor(stamp / 1000)) {
        stillOpen.add(p.sourceId);
        result.unchanged += 1;
        continue;
      }
    }
    if (fromTitle === null && !k && rejects.get(p.sourceId) === stamp) {
      result.skipped += 1;
      continue;
    }
    candidates.push(p);
  }

  let descriptions: Map<string, string> | null = null;
  if (candidates.some((p) => p.descriptionText === null)) {
    descriptions = await fetchDescriptions(company.atsType, company.boardSlug);
  }

  const statements: BatchItem<"sqlite">[] = [];
  for (const p of candidates) {
    const description = p.descriptionText ?? descriptions?.get(p.sourceId) ?? "";
    const row = toRow(company.id, p, description);
    if (row.level === "other") {
      rejects.set(p.sourceId, ms(p.postedAt) ?? 0);
      result.skipped += 1;
      continue;
    }
    stillOpen.add(p.sourceId);
    const k = known.get(p.sourceId);
    if (k && !changed(k, row)) {
      result.unchanged += 1;
      continue;
    }
    if (k) result.updated += 1;
    else result.inserted += 1;
    // Upsert even for "new" rows: the Vercel backup run may have inserted the
    // same posting a moment ago.
    statements.push(
      db
        .insert(schema.jobs)
        .values(row)
        .onConflictDoUpdate({ target: schema.jobs.sourceId, set: { ...row, sourceId: undefined } }),
    );
  }

  // Close postings this company no longer lists.
  const stale: number[] = [];
  for (const [sourceId, k] of known) {
    if (k.companyId === company.id && k.closedAt === null && !stillOpen.has(sourceId)) stale.push(k.id);
  }
  for (let i = 0; i < stale.length; i += 500) {
    statements.push(
      db
        .update(schema.jobs)
        .set({ closedAt: new Date() })
        .where(inArray(schema.jobs.id, stale.slice(i, i + 500))),
    );
  }
  result.closed += stale.length;

  // One round trip for the whole board, all-or-nothing.
  const [first, ...rest] = statements;
  if (first) await db.batch([first, ...rest]);
  result.companies += 1;
}

/** Switch off a board that's gone and close whatever it still had open. */
async function retireCompany(company: Company, known: Map<string, KnownJob>) {
  const open = [...known.values()].filter((k) => k.companyId === company.id && k.closedAt === null);
  await db.batch([
    db.update(schema.companies).set({ active: false }).where(eq(schema.companies.id, company.id)),
    ...(open.length
      ? [
          db
            .update(schema.jobs)
            .set({ closedAt: new Date() })
            .where(and(eq(schema.jobs.companyId, company.id), isNull(schema.jobs.closedAt))),
        ]
      : []),
  ]);
}

/**
 * Pull every active company's board, keep the new-grad-relevant software
 * roles, write only what changed, and close postings that left the board.
 *
 * Built for thousands of boards: one query loads every stored job up front,
 * boards are fetched `concurrency` at a time, Greenhouse descriptions are only
 * downloaded for boards with something new, and each board's writes go in one
 * batch. A `deadline` lets a time-limited host (a Vercel function) do a slice
 * and leave the rest; least recently synced boards go first.
 */
export async function refreshJobs(options: RefreshOptions = {}) {
  const result: IngestResult = {
    companies: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    closed: 0,
    skipped: 0,
    gone: 0,
    deferred: 0,
    errors: [],
  };
  const rejects = options.rejects ?? new Map();

  await ensureCompanies(options.boards);

  const allCompanies = await db
    .select()
    .from(schema.companies)
    .where(
      options.companyId
        ? eq(schema.companies.id, options.companyId)
        : eq(schema.companies.active, true),
    )
    .orderBy(sql`coalesce(${schema.companies.lastSyncedAt}, 0)`, schema.companies.id);
  const ordered = options.limit ? allCompanies.slice(0, options.limit) : allCompanies;
  // Alternate between ATS hosts instead of hitting ~5k Greenhouse boards back
  // to back; Greenhouse throttles bursts with 403s.
  const byAts = new Map<string, Company[]>();
  for (const c of ordered) byAts.set(c.atsType, [...(byAts.get(c.atsType) ?? []), c]);
  const queues = [...byAts.values()];
  const companies: Company[] = [];
  for (let i = 0; companies.length < ordered.length; i += 1) {
    for (const q of queues) if (i < q.length) companies.push(q[i]!);
  }

  const known = await loadKnownJobs();
  const synced: number[] = [];

  let next = 0;
  const worker = async () => {
    while (next < companies.length) {
      if (options.deadline && Date.now() > options.deadline) return;
      const company = companies[next++]!;
      try {
        await syncCompany(company, known, rejects, result);
        synced.push(company.id);
      } catch (error) {
        if (error instanceof BoardGoneError) {
          try {
            await retireCompany(company, known);
            result.gone += 1;
          } catch {
            // Try again next run.
          }
          continue;
        }
        result.errors.push({
          company: company.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? 4) }, worker));
  result.deferred = companies.length - next;

  // last_synced_at orders the next run (oldest first) and feeds "synced 5 min
  // ago" on the site. Stamping all ~10k companies every hour would be most of
  // the free tier's monthly writes, so a board is re-stamped at most daily,
  // plus the one that finished last so the site's max() stays current.
  if (synced.length > 0) {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86_400_000);
    for (let i = 0; i < synced.length; i += 500) {
      await db
        .update(schema.companies)
        .set({ lastSyncedAt: now })
        .where(
          and(
            inArray(schema.companies.id, synced.slice(i, i + 500)),
            sql`coalesce(${schema.companies.lastSyncedAt}, 0) < ${Math.floor(dayAgo.getTime() / 1000)}`,
          ),
        );
    }
    await db
      .update(schema.companies)
      .set({ lastSyncedAt: now })
      .where(eq(schema.companies.id, synced[synced.length - 1]!));
  }

  return result;
}

/**
 * Delete postings closed for more than `days`, unless someone's tracker,
 * score or tailoring run points at them. Keeps the table (and every full scan
 * the sync and board do) from growing without bound.
 */
export async function pruneClosedJobs(days = 90): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const res = await db
    .delete(schema.jobs)
    .where(
      and(
        lt(schema.jobs.closedAt, cutoff),
        sql`${schema.jobs.id} not in (select ${schema.applications.jobId} from ${schema.applications} where ${schema.applications.jobId} is not null)`,
        sql`${schema.jobs.id} not in (select ${schema.resumeScores.jobId} from ${schema.resumeScores} where ${schema.resumeScores.jobId} is not null)`,
        sql`${schema.jobs.id} not in (select ${schema.resumeTailors.jobId} from ${schema.resumeTailors} where ${schema.resumeTailors.jobId} is not null)`,
      ),
    );
  return res.rowsAffected;
}
