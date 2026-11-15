import { z } from "zod";
import { and, count, desc, eq, gte, isNull, like, or, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";

/**
 * Per-instance memo for the board's aggregate queries. With ~10k companies
 * each count or group-by reads every open job, and Turso's free tier counts
 * rows read; the numbers only move when the hourly sync runs, so a few
 * minutes stale costs nothing a visitor would notice.
 */
const memo = new Map<string, { at: number; value: Promise<unknown> }>();
function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  memo.set(key, { at: Date.now(), value });
  // A failed load must not be served from the cache until it expires.
  value.catch(() => memo.delete(key));
  if (memo.size > 500) memo.delete(memo.keys().next().value!);
  return value;
}

const levelEnum = z.enum(["intern", "new_grad", "junior", "other"]);

const listInput = z.object({
  query: z.string().trim().max(120).optional(),
  level: levelEnum.optional(),
  location: z.string().trim().max(120).optional(),
  remote: z.boolean().optional(),
  sponsorsVisa: z.boolean().optional(),
  /** Only jobs posted within this many days. */
  postedWithinDays: z.number().int().min(1).max(365).optional(),
  sort: z.enum(["newest", "company"]).default("newest"),
  limit: z.number().int().min(1).max(60).default(24),
  offset: z.number().int().min(0).default(0),
});

function buildWhere(input: z.infer<typeof listInput>) {
  const clauses = [isNull(schema.jobs.closedAt)];

  if (input.query) {
    const q = `%${input.query.toLowerCase()}%`;
    const match = or(
      like(sql`lower(${schema.jobs.title})`, q),
      like(sql`lower(${schema.companies.name})`, q),
      like(sql`lower(${schema.jobs.summary})`, q),
    );
    if (match) clauses.push(match);
  }
  if (input.level) clauses.push(eq(schema.jobs.level, input.level));
  if (input.location) {
    clauses.push(like(sql`lower(${schema.jobs.location})`, `%${input.location.toLowerCase()}%`));
  }
  if (input.remote !== undefined) clauses.push(eq(schema.jobs.remote, input.remote));
  if (input.sponsorsVisa !== undefined) {
    clauses.push(eq(schema.jobs.sponsorsVisa, input.sponsorsVisa));
  }
  if (input.postedWithinDays) {
    const cutoff = new Date(Date.now() - input.postedWithinDays * 86400000);
    clauses.push(gte(schema.jobs.postedAt, cutoff));
  }
  return and(...clauses);
}

export const jobs = {
  /** Public, filterable job feed. */
  list: base.input(listInput).handler(async ({ input }) => {
    const where = buildWhere(input);

    const rows = await db
      .select({
        id: schema.jobs.id,
        title: schema.jobs.title,
        location: schema.jobs.location,
        remote: schema.jobs.remote,
        level: schema.jobs.level,
        sponsorsVisa: schema.jobs.sponsorsVisa,
        applyUrl: schema.jobs.applyUrl,
        summary: schema.jobs.summary,
        postedAt: schema.jobs.postedAt,
        createdAt: schema.jobs.createdAt,
        companyId: schema.companies.id,
        companyName: schema.companies.name,
        companyLogo: schema.companies.logoUrl,
      })
      .from(schema.jobs)
      .innerJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
      .where(where)
      // posted_at then id is exactly the order of jobs_posted_at_idx (SQLite
      // appends the rowid), so the newest page reads only its own rows.
      .orderBy(
        ...(input.sort === "company"
          ? [schema.companies.name]
          : [desc(schema.jobs.postedAt), desc(schema.jobs.id)]),
      )
      .limit(input.limit)
      .offset(input.offset);

    const { limit: _limit, offset: _offset, sort: _sort, ...filters } = input;
    const total = await cached(`total:${JSON.stringify(filters)}`, 5 * 60_000, async () => {
      const [totals] = await db
        .select({ total: count() })
        .from(schema.jobs)
        .innerJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
        .where(where);
      return totals?.total ?? 0;
    });

    return { jobs: rows, total };
  }),

  /** Single job with its description text (used by the resume tools). */
  get: base.input(z.object({ id: z.number().int() })).handler(async ({ input }) => {
    const [row] = await db
      .select({
        id: schema.jobs.id,
        title: schema.jobs.title,
        location: schema.jobs.location,
        remote: schema.jobs.remote,
        level: schema.jobs.level,
        sponsorsVisa: schema.jobs.sponsorsVisa,
        applyUrl: schema.jobs.applyUrl,
        summary: schema.jobs.summary,
        postedAt: schema.jobs.postedAt,
        companyName: schema.companies.name,
        companyLogo: schema.companies.logoUrl,
        companyWebsite: schema.companies.website,
      })
      .from(schema.jobs)
      .innerJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
      .where(eq(schema.jobs.id, input.id));

    if (!row) throw new ORPCError("NOT_FOUND", { message: "Job not found." });
    return row;
  }),

  /** Headline counters for the marketing site and board header. */
  stats: base.handler(() => cached("stats", 5 * 60_000, async () => {
    const [open] = await db
      .select({ total: count() })
      .from(schema.jobs)
      .where(isNull(schema.jobs.closedAt));
    const [companyCount] = await db
      .select({ total: count() })
      .from(schema.companies)
      .where(eq(schema.companies.active, true));
    const [fresh] = await db
      .select({ total: count() })
      .from(schema.jobs)
      .where(
        and(
          isNull(schema.jobs.closedAt),
          gte(schema.jobs.postedAt, new Date(Date.now() - 7 * 86400000)),
        ),
      );
    const [lastSync] = await db
      .select({ at: sql<number | null>`max(${schema.companies.lastSyncedAt})` })
      .from(schema.companies);

    return {
      openJobs: open?.total ?? 0,
      companies: companyCount?.total ?? 0,
      postedThisWeek: fresh?.total ?? 0,
      lastSyncedAt: lastSync?.at ? new Date(lastSync.at * 1000) : null,
    };
  })),

  /** Distinct locations for the filter dropdown. */
  locations: base.handler(() => cached("locations", 15 * 60_000, async () => {
    const rows = await db
      .select({ location: schema.jobs.location, total: count() })
      .from(schema.jobs)
      .where(and(isNull(schema.jobs.closedAt), sql`${schema.jobs.location} is not null`))
      .groupBy(schema.jobs.location)
      .orderBy(desc(count()))
      .limit(40);
    return rows.filter((r) => r.location);
  })),
};

export const companies = {
  /**
   * The companies with the most open roles, for the landing page's "hiring
   * right now" strip. Capped: the full list is ~10k boards.
   */
  list: base.handler(() => cached("companies", 15 * 60_000, async () => {
    // Written out by hand: in a select list drizzle drops table qualifiers,
    // and an unqualified "id" inside this subquery resolves to jobs.id, which
    // made every company count 1.
    const openJobs = sql<number>`(
      select count(*) from jobs as j
      where j.company_id = "companies"."id" and j.closed_at is null
    )`;
    const rows = await db
      .select({
        id: schema.companies.id,
        name: schema.companies.name,
        logoUrl: schema.companies.logoUrl,
        website: schema.companies.website,
        atsType: schema.companies.atsType,
        lastSyncedAt: schema.companies.lastSyncedAt,
        openJobs,
      })
      .from(schema.companies)
      .where(and(eq(schema.companies.active, true), sql`${openJobs} > 0`))
      .orderBy(desc(openJobs), schema.companies.name)
      .limit(24);
    return rows;
  })),
};
