import { z } from "zod";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";
import { db } from "../database";
import * as schema from "../database/schema";
import { FEATURES, featureBalance, requireFeature, trackFeature } from "../lib/billing";

export const STATUSES = ["saved", "applied", "interviewing", "offer", "rejected"] as const;
const statusEnum = z.enum(STATUSES);

function startOfWeek(now = new Date()) {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

/** Consecutive days (ending today or yesterday) with at least one applied event. */
function computeStreak(appliedDates: Date[]): number {
  if (appliedDates.length === 0) return 0;
  const days = new Set(
    appliedDates.map((d) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x.getTime();
    }),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let cursor = today.getTime();
  if (!days.has(cursor)) {
    cursor -= 86400000;
    if (!days.has(cursor)) return 0;
  }
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 86400000;
  }
  return streak;
}

export const applications = {
  /** Every tracked application for the signed-in user, joined with job data. */
  list: authed.handler(async ({ context }) => {
    const rows = await db
      .select({
        id: schema.applications.id,
        status: schema.applications.status,
        position: schema.applications.position,
        notes: schema.applications.notes,
        appliedAt: schema.applications.appliedAt,
        createdAt: schema.applications.createdAt,
        jobId: schema.applications.jobId,
        customCompany: schema.applications.customCompany,
        customTitle: schema.applications.customTitle,
        customUrl: schema.applications.customUrl,
        jobTitle: schema.jobs.title,
        jobLocation: schema.jobs.location,
        jobRemote: schema.jobs.remote,
        jobLevel: schema.jobs.level,
        applyUrl: schema.jobs.applyUrl,
        companyName: schema.companies.name,
        companyLogo: schema.companies.logoUrl,
      })
      .from(schema.applications)
      .leftJoin(schema.jobs, eq(schema.applications.jobId, schema.jobs.id))
      .leftJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
      .where(eq(schema.applications.userId, context.user.id))
      .orderBy(schema.applications.position, desc(schema.applications.createdAt));

    return rows.map((r) => ({
      ...r,
      title: r.jobTitle ?? r.customTitle ?? "Untitled role",
      company: r.companyName ?? r.customCompany ?? "Unknown company",
      url: r.applyUrl ?? r.customUrl,
      logo: r.companyLogo,
    }));
  }),

  /** Tracker stats header: applied this week, streak, response rate, usage. */
  stats: authed.handler(async ({ context }) => {
    const userId = context.user.id;

    const [total] = await db
      .select({ total: count() })
      .from(schema.applications)
      .where(eq(schema.applications.userId, userId));

    const [thisWeek] = await db
      .select({ total: count() })
      .from(schema.applications)
      .where(
        and(
          eq(schema.applications.userId, userId),
          gte(schema.applications.appliedAt, startOfWeek()),
        ),
      );

    const appliedRows = await db
      .select({ appliedAt: schema.applications.appliedAt })
      .from(schema.applications)
      .where(and(eq(schema.applications.userId, userId), sql`${schema.applications.appliedAt} is not null`));

    const byStatus = await db
      .select({ status: schema.applications.status, total: count() })
      .from(schema.applications)
      .where(eq(schema.applications.userId, userId))
      .groupBy(schema.applications.status);

    const counts = Object.fromEntries(byStatus.map((r) => [r.status, r.total]));
    const appliedOrBeyond =
      (counts.applied ?? 0) + (counts.interviewing ?? 0) + (counts.offer ?? 0) + (counts.rejected ?? 0);
    const responded = (counts.interviewing ?? 0) + (counts.offer ?? 0) + (counts.rejected ?? 0);

    const slots = await featureBalance(userId, FEATURES.trackerSlots);

    return {
      total: total?.total ?? 0,
      appliedThisWeek: thisWeek?.total ?? 0,
      streak: computeStreak(appliedRows.map((r) => r.appliedAt!).filter(Boolean)),
      responseRate: appliedOrBeyond > 0 ? Math.round((responded / appliedOrBeyond) * 100) : 0,
      byStatus: counts,
      slotLimit: slots?.granted ?? null,
      slotsRemaining: slots?.remaining ?? null,
      slotsUnlimited: slots?.unlimited ?? false,
    };
  }),

  /** Track a job from the board. */
  track: authed
    .input(z.object({ jobId: z.number().int(), status: statusEnum.default("saved") }))
    .handler(async ({ input, context }) => {
      const userId = context.user.id;

      const [existing] = await db
        .select({ id: schema.applications.id })
        .from(schema.applications)
        .where(and(eq(schema.applications.userId, userId), eq(schema.applications.jobId, input.jobId)));
      if (existing) return { id: existing.id, alreadyTracked: true };

      await requireFeature(userId, FEATURES.trackerSlots);

      const [job] = await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, input.jobId));
      if (!job) throw new ORPCError("NOT_FOUND", { message: "Job not found." });

      const [row] = await db
        .insert(schema.applications)
        .values({
          userId,
          jobId: input.jobId,
          status: input.status,
          appliedAt: input.status === "applied" ? new Date() : null,
        })
        .returning();

      await trackFeature(userId, FEATURES.trackerSlots);
      return { id: row!.id, alreadyTracked: false };
    }),

  /** Manual entry for a job found elsewhere. */
  createManual: authed
    .input(
      z.object({
        company: z.string().trim().min(1).max(120),
        title: z.string().trim().min(1).max(160),
        url: z.string().trim().url().max(500).optional().or(z.literal("")),
        status: statusEnum.default("saved"),
        notes: z.string().trim().max(2000).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const userId = context.user.id;
      await requireFeature(userId, FEATURES.trackerSlots);

      const [row] = await db
        .insert(schema.applications)
        .values({
          userId,
          customCompany: input.company,
          customTitle: input.title,
          customUrl: input.url || null,
          status: input.status,
          notes: input.notes ?? null,
          appliedAt: input.status === "applied" ? new Date() : null,
        })
        .returning();

      await trackFeature(userId, FEATURES.trackerSlots);
      return row!;
    }),

  /** Move a card between columns / reorder. */
  updateStatus: authed
    .input(
      z.object({
        id: z.number().int(),
        status: statusEnum,
        position: z.number().int().min(0).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [existing] = await db
        .select()
        .from(schema.applications)
        .where(
          and(eq(schema.applications.id, input.id), eq(schema.applications.userId, context.user.id)),
        );
      if (!existing) throw new ORPCError("NOT_FOUND", { message: "Application not found." });

      const movingToApplied = input.status === "applied" && existing.status !== "applied";

      const [row] = await db
        .update(schema.applications)
        .set({
          status: input.status,
          position: input.position ?? existing.position,
          appliedAt: movingToApplied ? new Date() : (existing.appliedAt ?? null),
          updatedAt: new Date(),
        })
        .where(eq(schema.applications.id, input.id))
        .returning();
      return row!;
    }),

  update: authed
    .input(
      z.object({
        id: z.number().int(),
        notes: z.string().trim().max(2000).optional(),
        customCompany: z.string().trim().max(120).optional(),
        customTitle: z.string().trim().max(160).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const { id, ...patch } = input;
      const [row] = await db
        .update(schema.applications)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(schema.applications.id, id), eq(schema.applications.userId, context.user.id)))
        .returning();
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Application not found." });
      return row;
    }),

  remove: authed.input(z.object({ id: z.number().int() })).handler(async ({ input, context }) => {
    const userId = context.user.id;
    const [row] = await db
      .delete(schema.applications)
      .where(and(eq(schema.applications.id, input.id), eq(schema.applications.userId, userId)))
      .returning();
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Application not found." });
    await trackFeature(userId, FEATURES.trackerSlots, -1);
    return { ok: true };
  }),

  /** Ids of jobs the user already tracks — powers the board's Track button state. */
  trackedJobIds: authed.handler(async ({ context }) => {
    const rows = await db
      .select({ jobId: schema.applications.jobId })
      .from(schema.applications)
      .where(eq(schema.applications.userId, context.user.id));
    return rows.map((r) => r.jobId).filter((id): id is number => id !== null);
  }),
};
