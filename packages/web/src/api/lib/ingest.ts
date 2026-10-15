import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import {
  buildSummary,
  classifyLevel,
  detectRemote,
  detectVisaSponsorship,
  fetchBoard,
  isSoftwareRole,
} from "./ats";
import { SEED_COMPANIES, logoFor } from "./seed-companies";

export interface IngestResult {
  companies: number;
  inserted: number;
  updated: number;
  closed: number;
  skipped: number;
  errors: { company: string; error: string }[];
}

/** Insert any seed companies that aren't in the database yet. */
export async function ensureSeedCompanies(): Promise<number> {
  const existing = await db
    .select({ atsType: schema.companies.atsType, boardSlug: schema.companies.boardSlug })
    .from(schema.companies);
  const known = new Set(existing.map((c) => `${c.atsType}:${c.boardSlug}`));
  const missing = SEED_COMPANIES.filter((c) => !known.has(`${c.atsType}:${c.boardSlug}`));
  if (missing.length === 0) return 0;

  await db.insert(schema.companies).values(
    missing.map((c) => ({
      name: c.name,
      atsType: c.atsType,
      boardSlug: c.boardSlug,
      website: c.website,
      logoUrl: logoFor(c.website),
    })),
  );
  return missing.length;
}

/**
 * Pull every active company's board, normalize postings into `jobs`, upsert by
 * source_id, and close postings that vanished from the source.
 * `limit` caps how many companies are processed in one run.
 */
export async function refreshJobs(options: { limit?: number; companyId?: number } = {}) {
  const result: IngestResult = {
    companies: 0,
    inserted: 0,
    updated: 0,
    closed: 0,
    skipped: 0,
    errors: [],
  };

  await ensureSeedCompanies();

  const allCompanies = await db
    .select()
    .from(schema.companies)
    .where(
      options.companyId
        ? eq(schema.companies.id, options.companyId)
        : eq(schema.companies.active, true),
    );

  const companies = options.limit ? allCompanies.slice(0, options.limit) : allCompanies;

  for (const company of companies) {
    try {
      const postings = await fetchBoard(company.atsType, company.boardSlug);
      result.companies += 1;

      // Only new-grad-relevant software roles make it into the feed.
      const relevant = postings.filter((p) => {
        if (!isSoftwareRole(p.title)) return false;
        const level = classifyLevel(p.title, p.descriptionText);
        return level !== "other";
      });
      result.skipped += postings.length - relevant.length;

      const existing = await db
        .select({ id: schema.jobs.id, sourceId: schema.jobs.sourceId })
        .from(schema.jobs)
        .where(eq(schema.jobs.companyId, company.id));
      const bySource = new Map(existing.map((j) => [j.sourceId, j.id]));

      for (const p of relevant) {
        const row = {
          companyId: company.id,
          sourceId: p.sourceId,
          title: p.title,
          location: p.location,
          remote: detectRemote(p.location, p.descriptionText),
          level: classifyLevel(p.title, p.descriptionText),
          sponsorsVisa: detectVisaSponsorship(p.descriptionText),
          applyUrl: p.applyUrl,
          summary: buildSummary(p.descriptionText),
          descriptionText: p.descriptionText.slice(0, 12000),
          postedAt: p.postedAt,
          closedAt: null,
        };
        const known = bySource.get(p.sourceId);
        if (known) {
          await db.update(schema.jobs).set(row).where(eq(schema.jobs.id, known));
          result.updated += 1;
        } else {
          await db.insert(schema.jobs).values(row);
          result.inserted += 1;
        }
      }

      // Close postings that are no longer listed on the source board.
      const liveSourceIds = relevant.map((p) => p.sourceId);
      const stale = await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(
          and(
            eq(schema.jobs.companyId, company.id),
            isNull(schema.jobs.closedAt),
            liveSourceIds.length > 0
              ? notInArray(schema.jobs.sourceId, liveSourceIds)
              : undefined,
          ),
        );
      if (stale.length > 0) {
        await db
          .update(schema.jobs)
          .set({ closedAt: new Date() })
          .where(
            inArray(
              schema.jobs.id,
              stale.map((s) => s.id),
            ),
          );
        result.closed += stale.length;
      }

      await db
        .update(schema.companies)
        .set({ lastSyncedAt: new Date() })
        .where(eq(schema.companies.id, company.id));
    } catch (error) {
      result.errors.push({
        company: company.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
