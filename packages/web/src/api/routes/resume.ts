import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { generateObject } from "ai";
import dedent from "dedent";
import { authed } from "../middleware/auth";
import { db } from "../database";
import * as schema from "../database/schema";
import { s3 } from "../lib/s3";
import { gateway, RESUME_MODEL } from "../agent/gateway";
import { FEATURES, featureBalance, requireFeature, trackFeature } from "../lib/billing";

const TRUTH_RULE = dedent`
  Hard rule: never invent experience, employers, dates, metrics, degrees, or skills.
  Work only with facts already present in the resume text. If a job asks for
  something the candidate does not have, say so in the gaps instead of fabricating it.
`;

/**
 * These schemas are deliberately permissive on length and array size. The model
 * routinely returns a few more keywords or a slightly longer rewrite than we want
 * to render, and a hard `.max()` makes Zod reject the whole response — turning a
 * perfectly good answer into a 500. We accept what comes back and clamp it to
 * display limits in `clampScore`/`clampTailor` below instead.
 */
const scoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.string(),
  missingKeywords: z.array(z.string()),
  suggestions: z.array(
    z.object({
      original: z.string(),
      rewrite: z.string(),
      why: z.string(),
    }),
  ),
});

const tailorSchema = z.object({
  changes: z.array(
    z.object({
      section: z.string(),
      original: z.string(),
      tailored: z.string(),
      rationale: z.string(),
    }),
  ),
});

/** Trims a string to `max` characters on a word boundary where possible. */
function trim(value: string, max: number) {
  const clean = value.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

function clampScore(object: z.infer<typeof scoreSchema>) {
  return {
    score: object.score,
    verdict: trim(object.verdict, 400),
    missingKeywords: object.missingKeywords
      .filter((k) => k.trim().length > 0)
      .slice(0, 12)
      .map((k) => trim(k, 60)),
    suggestions: object.suggestions.slice(0, 3).map((s) => ({
      original: trim(s.original, 400),
      rewrite: trim(s.rewrite, 400),
      why: trim(s.why, 300),
    })),
  };
}

function clampTailor(object: z.infer<typeof tailorSchema>) {
  return {
    changes: object.changes.slice(0, 8).map((c) => ({
      section: trim(c.section, 80),
      original: trim(c.original, 600),
      tailored: trim(c.tailored, 600),
      rationale: trim(c.rationale, 300),
    })),
  };
}

async function loadResume(userId: string, resumeId?: number) {
  const rows = await db
    .select()
    .from(schema.resumes)
    .where(
      resumeId
        ? and(eq(schema.resumes.userId, userId), eq(schema.resumes.id, resumeId))
        : eq(schema.resumes.userId, userId),
    )
    .orderBy(desc(schema.resumes.createdAt))
    .limit(1);
  const resume = rows[0];
  if (!resume) {
    throw new ORPCError("BAD_REQUEST", { message: "Upload a resume first." });
  }
  if (!resume.extractedText.trim()) {
    throw new ORPCError("BAD_REQUEST", {
      message: "We couldn't read any text from that PDF. Try exporting it as a text-based PDF.",
    });
  }
  return resume;
}

async function loadJobContext(jobId: number) {
  const [job] = await db
    .select({
      id: schema.jobs.id,
      title: schema.jobs.title,
      location: schema.jobs.location,
      level: schema.jobs.level,
      description: schema.jobs.descriptionText,
      summary: schema.jobs.summary,
      companyName: schema.companies.name,
    })
    .from(schema.jobs)
    .innerJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
    .where(eq(schema.jobs.id, jobId));
  if (!job) throw new ORPCError("NOT_FOUND", { message: "Job not found." });
  return job;
}

export const resume = {
  /** Presigned PUT so the browser uploads straight to Tigris. */
  presign: authed
    .input(z.object({ filename: z.string().max(200), contentType: z.string().max(100) }))
    .handler(async ({ input, context }) => {
      if (input.contentType !== "application/pdf") {
        throw new ORPCError("BAD_REQUEST", { message: "Upload a PDF." });
      }
      const safe = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
      const key = `resumes/${context.user.id}/${Date.now()}-${safe}`;
      const url = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: key,
          ContentType: input.contentType,
        }),
        { expiresIn: 600 },
      );
      return { url, key };
    }),

  /** Called after the client PUTs the file: pull it back, extract text, save. */
  register: authed
    .input(z.object({ key: z.string().max(400), filename: z.string().max(200) }))
    .handler(async ({ input, context }) => {
      if (!input.key.startsWith(`resumes/${context.user.id}/`)) {
        throw new ORPCError("FORBIDDEN", { message: "Invalid upload key." });
      }

      const object = await s3.send(
        new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: input.key }),
      );
      const bytes = await object.Body!.transformToByteArray();

      let text = "";
      try {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(new Uint8Array(bytes));
        const extracted = await extractText(pdf, { mergePages: true });
        text = Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text;
      } catch (e) {
        console.error("[resume] pdf extraction failed:", e);
      }

      const [row] = await db
        .insert(schema.resumes)
        .values({
          userId: context.user.id,
          filename: input.filename,
          fileKey: input.key,
          extractedText: text.replace(/\s+\n/g, "\n").slice(0, 25000).trim(),
        })
        .returning();

      return {
        id: row!.id,
        filename: row!.filename,
        characters: row!.extractedText.length,
        createdAt: row!.createdAt,
      };
    }),

  /** The user's current resume (most recent upload). */
  current: authed.handler(async ({ context }) => {
    const [row] = await db
      .select({
        id: schema.resumes.id,
        filename: schema.resumes.filename,
        fileKey: schema.resumes.fileKey,
        characters: schema.resumes.extractedText,
        createdAt: schema.resumes.createdAt,
      })
      .from(schema.resumes)
      .where(eq(schema.resumes.userId, context.user.id))
      .orderBy(desc(schema.resumes.createdAt))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      filename: row.filename,
      characters: row.characters.length,
      preview: row.characters.slice(0, 600),
      createdAt: row.createdAt,
    };
  }),

  /** Signed download link for the stored PDF. */
  downloadUrl: authed.input(z.object({ id: z.number().int() })).handler(async ({ input, context }) => {
    const [row] = await db
      .select({ fileKey: schema.resumes.fileKey })
      .from(schema.resumes)
      .where(and(eq(schema.resumes.id, input.id), eq(schema.resumes.userId, context.user.id)));
    if (!row) throw new ORPCError("NOT_FOUND", { message: "Resume not found." });
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: row.fileKey }),
      { expiresIn: 3600 },
    );
    return { url };
  }),

  /** AI match score against one job. Metered. */
  score: authed
    .input(z.object({ jobId: z.number().int(), resumeId: z.number().int().optional() }))
    .handler(async ({ input, context }) => {
      const userId = context.user.id;
      await requireFeature(userId, FEATURES.resumeScore);

      const [resumeRow, job] = await Promise.all([
        loadResume(userId, input.resumeId),
        loadJobContext(input.jobId),
      ]);

      const { object } = await generateObject({
        model: gateway(RESUME_MODEL),
        schema: scoreSchema,
        system: dedent`
          You are a blunt but fair technical recruiter screening new-grad and junior
          software engineering candidates. You score how well a resume matches one
          specific job posting.

          ${TRUTH_RULE}

          Scoring guide: 80-100 strong match worth applying immediately, 60-79 worth
          applying after tailoring, 40-59 a stretch, under 40 a poor fit.
          Keep the verdict to two sentences. Give at most three bullet rewrites,
          each rewriting a real line from the resume.
        `,
        prompt: dedent`
          JOB
          Company: ${job.companyName}
          Title: ${job.title}
          Location: ${job.location ?? "unspecified"}
          Level: ${job.level}

          Job description:
          ${(job.description ?? job.summary ?? "").slice(0, 8000)}

          RESUME
          ${resumeRow.extractedText.slice(0, 12000)}
        `,
      });

      const result = clampScore(object);

      const [saved] = await db
        .insert(schema.resumeScores)
        .values({
          userId,
          resumeId: resumeRow.id,
          jobId: job.id,
          score: result.score,
          verdict: result.verdict,
          missingKeywords: JSON.stringify(result.missingKeywords),
          suggestions: JSON.stringify(result.suggestions),
        })
        .returning();

      await trackFeature(userId, FEATURES.resumeScore);

      return {
        id: saved!.id,
        jobId: job.id,
        jobTitle: job.title,
        companyName: job.companyName,
        score: result.score,
        verdict: result.verdict,
        missingKeywords: result.missingKeywords,
        suggestions: result.suggestions,
        createdAt: saved!.createdAt,
      };
    }),

  /** AI tailoring — rewrites existing bullets for one job. Metered. */
  tailor: authed
    .input(z.object({ jobId: z.number().int(), resumeId: z.number().int().optional() }))
    .handler(async ({ input, context }) => {
      const userId = context.user.id;
      await requireFeature(userId, FEATURES.resumeTailor);

      const [resumeRow, job] = await Promise.all([
        loadResume(userId, input.resumeId),
        loadJobContext(input.jobId),
      ]);

      const { object } = await generateObject({
        model: gateway(RESUME_MODEL),
        schema: tailorSchema,
        system: dedent`
          You tailor an existing resume to one specific job posting for a new-grad or
          junior software engineer.

          ${TRUTH_RULE}

          Rewrite real bullets so the candidate's genuine work reads in the language
          the posting uses. Lead with action verbs, keep any real metrics, and stay
          within one line each. Return between three and six changes, each quoting the
          original line verbatim in "original".
        `,
        prompt: dedent`
          JOB
          Company: ${job.companyName}
          Title: ${job.title}

          Job description:
          ${(job.description ?? job.summary ?? "").slice(0, 8000)}

          RESUME
          ${resumeRow.extractedText.slice(0, 12000)}
        `,
      });

      const result = clampTailor(object);

      const [saved] = await db
        .insert(schema.resumeTailors)
        .values({
          userId,
          resumeId: resumeRow.id,
          jobId: job.id,
          changes: JSON.stringify(result.changes),
        })
        .returning();

      await trackFeature(userId, FEATURES.resumeTailor);

      return {
        id: saved!.id,
        jobId: job.id,
        jobTitle: job.title,
        companyName: job.companyName,
        changes: result.changes,
        createdAt: saved!.createdAt,
      };
    }),

  /** Approve a subset of tailoring changes (kept for export/record). */
  approveChanges: authed
    .input(z.object({ id: z.number().int(), approved: z.array(z.number().int()).max(20) }))
    .handler(async ({ input, context }) => {
      const [row] = await db
        .update(schema.resumeTailors)
        .set({ approved: JSON.stringify(input.approved) })
        .where(
          and(eq(schema.resumeTailors.id, input.id), eq(schema.resumeTailors.userId, context.user.id)),
        )
        .returning();
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Tailoring run not found." });
      return { ok: true };
    }),

  /** Past score runs, newest first. */
  history: authed.handler(async ({ context }) => {
    const rows = await db
      .select({
        id: schema.resumeScores.id,
        score: schema.resumeScores.score,
        verdict: schema.resumeScores.verdict,
        missingKeywords: schema.resumeScores.missingKeywords,
        suggestions: schema.resumeScores.suggestions,
        createdAt: schema.resumeScores.createdAt,
        jobId: schema.resumeScores.jobId,
        jobTitle: schema.jobs.title,
        companyName: schema.companies.name,
      })
      .from(schema.resumeScores)
      .leftJoin(schema.jobs, eq(schema.resumeScores.jobId, schema.jobs.id))
      .leftJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
      .where(eq(schema.resumeScores.userId, context.user.id))
      .orderBy(desc(schema.resumeScores.createdAt))
      .limit(20);

    return rows.map((r) => ({
      ...r,
      missingKeywords: JSON.parse(r.missingKeywords) as string[],
      suggestions: JSON.parse(r.suggestions) as { original: string; rewrite: string; why: string }[],
    }));
  }),
};

export const billing = {
  /** Plan + remaining allowances for the signed-in user. */
  usage: authed.handler(async ({ context }) => {
    const userId = context.user.id;
    const [score, tailor, slots] = await Promise.all([
      featureBalance(userId, FEATURES.resumeScore),
      featureBalance(userId, FEATURES.resumeTailor),
      featureBalance(userId, FEATURES.trackerSlots),
    ]);
    return { resumeScore: score, resumeTailor: tailor, trackerSlots: slots };
  }),
};
