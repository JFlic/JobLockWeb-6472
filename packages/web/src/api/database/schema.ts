import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Job Lock schema. Apply with `bun run db:push` (from packages/web).
 */

export * from "./auth-schema";


/** Companies whose ATS boards we ingest from. */
export const companies = sqliteTable(
  "companies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    /** greenhouse | lever | ashby */
    atsType: text("ats_type").notNull(),
    /** Board slug on that ATS. */
    boardSlug: text("board_slug").notNull(),
    logoUrl: text("logo_url"),
    website: text("website"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("companies_ats_slug_idx").on(t.atsType, t.boardSlug)],
);

/** Normalized job postings pulled from company ATS feeds. */
export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** Stable per-source identity: `${atsType}:${slug}:${externalId}`. */
    sourceId: text("source_id").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    remote: integer("remote", { mode: "boolean" }).notNull().default(false),
    /** intern | new_grad | junior | other */
    level: text("level").notNull().default("other"),
    sponsorsVisa: integer("sponsors_visa", { mode: "boolean" }).notNull().default(false),
    applyUrl: text("apply_url").notNull(),
    /** Short plain-text summary only — we never mirror full descriptions. */
    summary: text("summary"),
    /** Trimmed description text, kept server-side for resume scoring. */
    descriptionText: text("description_text"),
    postedAt: integer("posted_at", { mode: "timestamp" }),
    closedAt: integer("closed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("jobs_source_id_idx").on(t.sourceId),
    index("jobs_level_idx").on(t.level),
    index("jobs_posted_at_idx").on(t.postedAt),
    index("jobs_closed_at_idx").on(t.closedAt),
  ],
);

/** A user's tracked application. Either linked to a job row or fully manual. */
export const applications = sqliteTable(
  "applications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
    /** Manual entries (job found elsewhere). */
    customCompany: text("custom_company"),
    customTitle: text("custom_title"),
    customUrl: text("custom_url"),
    /** saved | applied | interviewing | offer | rejected */
    status: text("status").notNull().default("saved"),
    /** Ordering within a kanban column. */
    position: integer("position").notNull().default(0),
    notes: text("notes"),
    appliedAt: integer("applied_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("applications_user_idx").on(t.userId),
    index("applications_user_status_idx").on(t.userId, t.status),
  ],
);

/** Uploaded resumes with extracted text. */
export const resumes = sqliteTable(
  "resumes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    filename: text("filename").notNull(),
    fileKey: text("file_key").notNull(),
    extractedText: text("extracted_text").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("resumes_user_idx").on(t.userId)],
);

/** AI match-score runs against a specific job. */
export const resumeScores = sqliteTable(
  "resume_scores",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    resumeId: integer("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
    score: integer("score").notNull(),
    /** JSON string[] */
    missingKeywords: text("missing_keywords").notNull().default("[]"),
    /** JSON { original, rewrite, why }[] */
    suggestions: text("suggestions").notNull().default("[]"),
    verdict: text("verdict"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("resume_scores_user_idx").on(t.userId)],
);

/** AI tailoring runs — bullet rewrites the user can approve. */
export const resumeTailors = sqliteTable(
  "resume_tailors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    resumeId: integer("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
    /** JSON { section, original, tailored, rationale }[] */
    changes: text("changes").notNull().default("[]"),
    /** JSON number[] of approved change indexes */
    approved: text("approved").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("resume_tailors_user_idx").on(t.userId)],
);

/** Waitlist / digest email capture from the marketing site. */
export const waitlist = sqliteTable(
  "waitlist",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull().unique(),
    source: text("source"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("waitlist_email_idx").on(t.email)],
);
