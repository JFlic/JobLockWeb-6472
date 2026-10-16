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
import {
  DOCX_TYPE,
  applyChangesToDocx,
  applyChangesToText,
  buildDocx,
  extractDocxText,
} from "../lib/docx";

const TRUTH_RULE = dedent`
  Hard rule: never invent experience, employers, dates, metrics, degrees, or skills.
  Work only with facts already present in the resume text or the candidate's own
  experience notes. If a job asks for something the candidate does not have, say so
  in the gaps instead of fabricating it.
`;

const UPLOAD_TYPES = ["application/pdf", DOCX_TYPE];

/** Either a posting from the board or one the user pasted from elsewhere. */
const jobInput = {
  jobId: z.number().int().optional(),
  custom: z
    .object({
      company: z.string().trim().min(1).max(120),
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().min(80, "Paste the full job description.").max(20000),
    })
    .optional(),
};

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
  coverLetter: z.string(),
});

type Change = z.infer<typeof tailorSchema>["changes"][number];

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
    // Originals are not trimmed: export matches them verbatim against the resume.
    changes: object.changes.slice(0, 10).map((c) => ({
      section: trim(c.section, 80),
      original: c.original.trim().slice(0, 1200),
      tailored: trim(c.tailored, 600),
      rationale: trim(c.rationale, 300),
    })),
    coverLetter: object.coverLetter.trim().slice(0, 6000),
  };
}

async function loadBank(userId: string) {
  const [row] = await db
    .select({ content: schema.experienceBanks.content })
    .from(schema.experienceBanks)
    .where(eq(schema.experienceBanks.userId, userId));
  return row?.content ?? "";
}

async function readObject(key: string) {
  const object = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  return object.Body!.transformToByteArray();
}

async function extractPdfText(bytes: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const extracted = await extractText(pdf, { mergePages: true });
  return Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text;
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "Job";
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

type JobContext = {
  id: number | null;
  title: string;
  location: string | null;
  level: string;
  description: string | null;
  summary: string | null;
  companyName: string;
};

async function resolveJob(input: { jobId?: number; custom?: { company: string; title: string; description: string } }): Promise<JobContext> {
  if (input.jobId !== undefined) return loadJobContext(input.jobId);
  if (input.custom) {
    return {
      id: null,
      title: input.custom.title,
      location: null,
      level: "unspecified",
      description: input.custom.description,
      summary: null,
      companyName: input.custom.company,
    };
  }
  throw new ORPCError("BAD_REQUEST", { message: "Pick a posting or paste a job description." });
}

function bankBlock(bank: string) {
  return bank.trim()
    ? dedent`
        CANDIDATE'S OWN EXPERIENCE NOTES (true facts written by the candidate —
        projects, coursework, certifications, past cover-letter paragraphs)
        ${bank.slice(0, 12000)}
      `
    : "";
}

async function loadJobContext(jobId: number): Promise<JobContext> {
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
      if (!UPLOAD_TYPES.includes(input.contentType)) {
        throw new ORPCError("BAD_REQUEST", { message: "Upload a PDF or Word (.docx) file." });
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

      const bytes = await readObject(input.key);
      const isDocx = input.key.toLowerCase().endsWith(".docx");

      let text = "";
      try {
        text = isDocx ? await extractDocxText(bytes) : await extractPdfText(bytes);
      } catch (e) {
        console.error("[resume] text extraction failed:", e);
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
    .input(z.object({ ...jobInput, resumeId: z.number().int().optional() }))
    .handler(async ({ input, context }) => {
      const userId = context.user.id;
      await requireFeature(userId, FEATURES.resumeScore);

      const [resumeRow, job, bank] = await Promise.all([
        loadResume(userId, input.resumeId),
        resolveJob(input),
        loadBank(userId),
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

          ${bankBlock(bank)}
        `,
      });

      const result = clampScore(object);

      const [saved] = await db
        .insert(schema.resumeScores)
        .values({
          userId,
          resumeId: resumeRow.id,
          jobId: job.id,
          customCompany: job.id === null ? job.companyName : null,
          customTitle: job.id === null ? job.title : null,
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

  /** AI tailoring — rewrites existing bullets and drafts a cover letter for one job. Metered. */
  tailor: authed
    .input(z.object({ ...jobInput, resumeId: z.number().int().optional() }))
    .handler(async ({ input, context }) => {
      const userId = context.user.id;
      await requireFeature(userId, FEATURES.resumeTailor);

      const [resumeRow, job, bank] = await Promise.all([
        loadResume(userId, input.resumeId),
        resolveJob(input),
        loadBank(userId),
      ]);

      const { object } = await generateObject({
        model: gateway(RESUME_MODEL),
        schema: tailorSchema,
        system: dedent`
          You tailor an existing resume and write a matching cover letter for one
          specific job posting, for a new-grad or junior candidate.

          ${TRUTH_RULE}

          RESUME CHANGES
          Rewrite real lines so the candidate's genuine work reads in the language the
          posting uses. Only rewrite bullet points and the professional summary — never
          names, contact lines, section headings, job titles, schools, or dates.
          Lead with action verbs, keep any real metrics, and keep bullets to one line.
          You may reword a bullet to surface a skill from the experience notes only when
          the notes say that skill was used in that same role or project.
          Return between four and eight changes. "original" must copy one full line of
          the resume exactly, character for character, so it can be found and replaced.
          "section" is the resume heading or role the line sits under.

          COVER LETTER
          Plain text, 250-380 words, paragraphs separated by one blank line. Open with
          "Dear ${job.companyName} Hiring Team,". Three or four body paragraphs: why this
          role and company, then the two or three most relevant real experiences (prefer
          specifics from the experience notes and resume), then a short close. Sign off
          with "Sincerely," then the candidate's name. Confident, warm, specific — no
          clichés, no claims the materials don't support, no placeholders.
        `,
        prompt: dedent`
          JOB
          Company: ${job.companyName}
          Title: ${job.title}

          Job description:
          ${(job.description ?? job.summary ?? "").slice(0, 8000)}

          CANDIDATE NAME: ${context.user.name ?? "the candidate"}

          RESUME
          ${resumeRow.extractedText.slice(0, 12000)}

          ${bankBlock(bank)}
        `,
      });

      const result = clampTailor(object);

      const [saved] = await db
        .insert(schema.resumeTailors)
        .values({
          userId,
          resumeId: resumeRow.id,
          jobId: job.id,
          customCompany: job.id === null ? job.companyName : null,
          customTitle: job.id === null ? job.title : null,
          changes: JSON.stringify(result.changes),
          approved: JSON.stringify(result.changes.map((_, i) => i)),
          coverLetter: result.coverLetter,
        })
        .returning();

      await trackFeature(userId, FEATURES.resumeTailor);

      return {
        id: saved!.id,
        jobId: job.id,
        jobTitle: job.title,
        companyName: job.companyName,
        changes: result.changes,
        approved: result.changes.map((_, i) => i),
        coverLetter: result.coverLetter,
        createdAt: saved!.createdAt,
      };
    }),

  /** Save which changes to keep and the (possibly hand-edited) cover letter. */
  saveTailor: authed
    .input(
      z.object({
        id: z.number().int(),
        approved: z.array(z.number().int()).max(20),
        coverLetter: z.string().max(10000).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [row] = await db
        .update(schema.resumeTailors)
        .set({
          approved: JSON.stringify(input.approved),
          ...(input.coverLetter !== undefined ? { coverLetter: input.coverLetter } : {}),
        })
        .where(
          and(eq(schema.resumeTailors.id, input.id), eq(schema.resumeTailors.userId, context.user.id)),
        )
        .returning();
      if (!row) throw new ORPCError("NOT_FOUND", { message: "Tailoring run not found." });
      return { ok: true };
    }),

  /** Past tailoring runs, newest first — one per job applied to. */
  tailorHistory: authed.handler(async ({ context }) => {
    const rows = await db
      .select({
        id: schema.resumeTailors.id,
        jobId: schema.resumeTailors.jobId,
        customCompany: schema.resumeTailors.customCompany,
        customTitle: schema.resumeTailors.customTitle,
        changes: schema.resumeTailors.changes,
        approved: schema.resumeTailors.approved,
        coverLetter: schema.resumeTailors.coverLetter,
        createdAt: schema.resumeTailors.createdAt,
        jobTitle: schema.jobs.title,
        companyName: schema.companies.name,
      })
      .from(schema.resumeTailors)
      .leftJoin(schema.jobs, eq(schema.resumeTailors.jobId, schema.jobs.id))
      .leftJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
      .where(eq(schema.resumeTailors.userId, context.user.id))
      .orderBy(desc(schema.resumeTailors.createdAt))
      .limit(30);

    return rows.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      jobTitle: r.jobTitle ?? r.customTitle ?? "Removed posting",
      companyName: r.companyName ?? r.customCompany ?? "—",
      changes: JSON.parse(r.changes) as Change[],
      approved: JSON.parse(r.approved) as number[],
      coverLetter: r.coverLetter,
      createdAt: r.createdAt,
    }));
  }),

  /**
   * The tailored resume as a .docx. Word uploads keep their original formatting
   * with approved lines swapped in place; PDF uploads become a clean text .docx.
   */
  exportResume: authed.input(z.object({ id: z.number().int() })).handler(async ({ input, context }) => {
    const [run] = await db
      .select({
        changes: schema.resumeTailors.changes,
        approved: schema.resumeTailors.approved,
        fileKey: schema.resumes.fileKey,
        filename: schema.resumes.filename,
        extractedText: schema.resumes.extractedText,
        customCompany: schema.resumeTailors.customCompany,
        companyName: schema.companies.name,
      })
      .from(schema.resumeTailors)
      .innerJoin(schema.resumes, eq(schema.resumeTailors.resumeId, schema.resumes.id))
      .leftJoin(schema.jobs, eq(schema.resumeTailors.jobId, schema.jobs.id))
      .leftJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
      .where(and(eq(schema.resumeTailors.id, input.id), eq(schema.resumeTailors.userId, context.user.id)));
    if (!run) throw new ORPCError("NOT_FOUND", { message: "Tailoring run not found." });

    const approved = new Set(JSON.parse(run.approved) as number[]);
    const changes = (JSON.parse(run.changes) as Change[]).filter((_, i) => approved.has(i));
    const base = run.filename.replace(/\.(pdf|docx)$/i, "");
    const name = `${safeName(base)}_${safeName(run.companyName ?? run.customCompany ?? "Job")}.docx`;

    let bytes: Uint8Array;
    let missed: { original: string; tailored: string }[];
    if (run.fileKey.toLowerCase().endsWith(".docx")) {
      ({ bytes, missed } = await applyChangesToDocx(await readObject(run.fileKey), changes));
    } else {
      const result = applyChangesToText(run.extractedText, changes);
      bytes = await buildDocx(result.text.split("\n"));
      missed = result.missed;
    }

    return {
      file: new File([bytes], name, { type: DOCX_TYPE }),
      missed: missed.map(({ original, tailored }) => ({ original, tailored })),
    };
  }),

  /** The run's cover letter as a .docx. */
  exportCoverLetter: authed.input(z.object({ id: z.number().int() })).handler(async ({ input, context }) => {
    const [run] = await db
      .select({
        coverLetter: schema.resumeTailors.coverLetter,
        customCompany: schema.resumeTailors.customCompany,
        companyName: schema.companies.name,
      })
      .from(schema.resumeTailors)
      .leftJoin(schema.jobs, eq(schema.resumeTailors.jobId, schema.jobs.id))
      .leftJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
      .where(and(eq(schema.resumeTailors.id, input.id), eq(schema.resumeTailors.userId, context.user.id)));
    if (!run) throw new ORPCError("NOT_FOUND", { message: "Tailoring run not found." });
    if (!run.coverLetter.trim()) {
      throw new ORPCError("BAD_REQUEST", { message: "This run has no cover letter." });
    }

    const paragraphs = run.coverLetter.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const bytes = await buildDocx(paragraphs);
    const name = `Cover_Letter_${safeName(run.companyName ?? run.customCompany ?? "Job")}.docx`;
    return { file: new File([bytes], name, { type: DOCX_TYPE }) };
  }),

  /** The user's experience notes. */
  bank: authed.handler(async ({ context }) => {
    const [row] = await db
      .select()
      .from(schema.experienceBanks)
      .where(eq(schema.experienceBanks.userId, context.user.id));
    return { content: row?.content ?? "", updatedAt: row?.updatedAt ?? null };
  }),

  saveBank: authed
    .input(z.object({ content: z.string().max(30000) }))
    .handler(async ({ input, context }) => {
      const now = new Date();
      await db
        .insert(schema.experienceBanks)
        .values({ userId: context.user.id, content: input.content, updatedAt: now })
        .onConflictDoUpdate({
          target: schema.experienceBanks.userId,
          set: { content: input.content, updatedAt: now },
        });
      return { ok: true, updatedAt: now };
    }),

  /** Pulls the text out of an old cover letter or notes doc so it can be added to the bank. */
  extractDocument: authed
    .input(z.object({ file: z.instanceof(File) }))
    .handler(async ({ input }) => {
      if (input.file.size > 8 * 1024 * 1024) {
        throw new ORPCError("BAD_REQUEST", { message: "That file is over 8MB." });
      }
      const bytes = new Uint8Array(await input.file.arrayBuffer());
      const isDocx = input.file.name.toLowerCase().endsWith(".docx");
      try {
        const text = isDocx ? await extractDocxText(bytes) : await extractPdfText(bytes);
        return { text: text.trim().slice(0, 30000) };
      } catch (e) {
        console.error("[resume] document extraction failed:", e);
        throw new ORPCError("BAD_REQUEST", { message: "We couldn't read that file. Try a .docx or text-based PDF." });
      }
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
        customCompany: schema.resumeScores.customCompany,
        customTitle: schema.resumeScores.customTitle,
        jobTitle: schema.jobs.title,
        companyName: schema.companies.name,
      })
      .from(schema.resumeScores)
      .leftJoin(schema.jobs, eq(schema.resumeScores.jobId, schema.jobs.id))
      .leftJoin(schema.companies, eq(schema.jobs.companyId, schema.companies.id))
      .where(eq(schema.resumeScores.userId, context.user.id))
      .orderBy(desc(schema.resumeScores.createdAt))
      .limit(20);

    return rows.map(({ customCompany, customTitle, ...r }) => ({
      ...r,
      jobTitle: r.jobTitle ?? customTitle,
      companyName: r.companyName ?? customCompany,
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
