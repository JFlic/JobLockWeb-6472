import { z } from "zod";
import { and, count, desc, eq, gte, isNull, like, or, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";

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
      .orderBy(
        input.sort === "company"
          ? schema.companies.name
          : desc(sql`coalesce(${schema.jobs.postedAt}, ${schema.jobs.createdAt})`),
      )
      .limit(input.limit)
      .offset(input.offset);

    const [totals] = await db
      .select({ total: count() })
      .from(schema.jobs)
      .innerJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
      .where(where);

    return { jobs: rows, total: totals?.total ?? 0 };
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
  stats: base.handler(async () => {
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
          gte(
            sql`coalesce(${schema.jobs.postedAt}, ${schema.jobs.createdAt})`,
            Math.floor((Date.now() - 7 * 86400000) / 1000),
          ),
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
  }),

  /** Distinct locations for the filter dropdown. */
  locations: base.handler(async () => {
    const rows = await db
      .select({ location: schema.jobs.location, total: count() })
      .from(schema.jobs)
      .where(and(isNull(schema.jobs.closedAt), sql`${schema.jobs.location} is not null`))
      .groupBy(schema.jobs.location)
      .orderBy(desc(count()))
      .limit(40);
    return rows.filter((r) => r.location);
  }),
};

export const companies = {
  list: base.handler(async () => {
    const rows = await db
      .select({
        id: schema.companies.id,
        name: schema.companies.name,
        logoUrl: schema.companies.logoUrl,
        website: schema.companies.website,
        atsType: schema.companies.atsType,
        lastSyncedAt: schema.companies.lastSyncedAt,
        openJobs: sql<number>`(
          select count(*) from ${schema.jobs}
          where ${schema.jobs.companyId} = ${schema.companies.id}
            and ${schema.jobs.closedAt} is null
        )`,
      })
      .from(schema.companies)
      .where(eq(schema.companies.active, true))
      .orderBy(schema.companies.name);
    return rows;
  }),
};
