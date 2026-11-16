# Job Lock (web) — orientation

A job board of new-grad and junior software roles pulled straight from company
applicant-tracking boards, plus an application tracker (kanban) and AI resume
scoring and tailoring. Live at **https://jobs.thejoblockapp.com**. Also listed on
publik (https://publikhq.com/job-lock) so people can clone and run it.

This is the **web** repo. The iOS app (Flutter, Screen Time shield) is a separate
project; the root domain thejoblockapp.com and its `/privacy` and `/terms` pages
belong to it, not to this repo.

`AGENTS.md` holds the publik API rules for coding agents. Read it before touching
anything AI.

---

## Stack

| Layer | What | Notes |
|---|---|---|
| Runtime / tooling | Bun 1.3 (`packageManager: bun@1.3.14`), Turborepo, TypeScript | Monorepo: `packages/web` is the product; `packages/desktop` and `packages/mobile` are template leftovers, not shipped |
| Frontend | React 19, Vite, Tailwind 4, wouter (routing), TanStack Query, dnd-kit (tracker drag) | `packages/web/src/web` |
| API | Hono + oRPC (typed RPC, `@orpc/server` / `@orpc/tanstack-query`) | `packages/web/src/api`; routes in `routes/{jobs,applications,resume,ping}.ts` |
| Database | Turso (libSQL) + Drizzle ORM | Tables: `companies`, `jobs`, `applications`, `resumes`, `resume_scores`, `resume_tailors`, `experience_banks`, `waitlist` (+ Better Auth tables) |
| Auth | Better Auth, email + password | Google sign-in is hidden unless `VITE_RUNABLE_AUTH_ISSUER` is set (`src/web/lib/flags.ts`) |
| File storage | Cloudflare R2 via the S3 SDK | Bucket `joblock-resumes`, private; uploaded resumes. CORS allows only the production origin. **Per-user caps: 10 resumes, 5 MB each** (`MAX_RESUMES`, `MAX_RESUME_BYTES` in `routes/resume.ts`); counted from the bucket itself, size signed into the upload URL, both re-checked at register; users delete old ones on the Resume page |
| Resume parsing | `unpdf` (PDF), `jszip` (DOCX) | Text is extracted and stored; capped at 25,000 chars |
| AI | Vercel AI SDK (`ai` v7) `generateObject` | Provider chosen at runtime: publik API or AI Gateway. See below |
| Billing | Autumn (`autumn-js`, plans in `autumn.config.ts`) | **Not configured in production** — see *Known gaps* |
| Job ingestion | Greenhouse, Lever and Ashby public board APIs (`src/api/lib/ats.ts`, `lib/ingest.ts`) | ~10k boards listed in `data/boards.json`; filtered to new-grad/junior/intern software roles. Synced hourly by `.github/workflows/sync-jobs.yml` running `tools/sync-jobs.ts` on the runner (needs repo secrets `DATABASE_URL`, `DATABASE_AUTH_TOKEN`); the daily Vercel cron is a 240s time-boxed backup |
| Hosting | Vercel, project `joblock-jobs`, Hobby plan | Auto-deploys from `main`. Build: `packages/web/deploy/vercel-build.ts` (Build Output API). Cron: daily 12:00 UTC hits `/api/cron/refresh-jobs` |
| publik | `src/api/publik.ts` (Sign in with publik, usage counting, publik API) | Slug `job-lock`. `publik-app-token.txt` at the repo root is public by design |

### Commands

```bash
bun install
bun run dev                      # vite dev server on :4200 — runs the publik sign-in gate first
cd packages/web && bunx tsc --noEmit -p .   # typecheck
bun packages/web/deploy/vercel-build.ts     # reproduce the Vercel build locally
```

Local sign-in testing needs `LOCAL_NO_AUTH=false VITE_LOCAL_NO_AUTH=false
WEBSITE_URL=http://localhost:4200`, and `JOB_REFRESH_ENABLED=false` to stop the
in-process scheduler hammering the job boards.

There is no formatter config. Do **not** run `oxfmt` over existing files: it
reformats untouched code with its defaults and buries the real diff.

### Secrets

Secrets live **only** in the Vercel dashboard (as Secret type where they are
keys). Never commit them, never put them in a repo file, never print them. The
one deliberate exception is `publik-app-token.txt` (a `pat_` token that can only
mint capped installs for this app; clones need it).

Production env vars: `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `BETTER_AUTH_SECRET`,
`CRON_SECRET`, `WEBSITE_URL`, `NODE_ENV`, `S3_*` (R2), and `PUBLIK_API_KEY`.
Not set: `AI_GATEWAY_API_KEY`, `AUTUMN_SECRET_KEY`.

---

## How AI credits are used

### What calls a model

Exactly two features, both in `src/api/routes/resume.ts`, both a single
`generateObject` call with a Zod schema:

| Feature | Sends to the model | Returns |
|---|---|---|
| **Score my resume** (`resume_score`) | Job description (≤ 8,000 chars), resume text (≤ 12,000), the user's experience notes (≤ 12,000) | 0–100 score, verdict, missing keywords, suggestions |
| **Tailor** (`resume_tailor`) | The same inputs | Rewritten bullet changes and a cover letter |

Nothing else in the app uses AI. The job board, tracker and resume upload cost
no AI credit.

### Who pays: the provider switch

`withAi()` in `src/api/agent/gateway.ts` picks the provider for every call via
the publik module's `resolveProvider()`:

1. **`PUBLIK_API_KEY` is set** → publik API, model tier `publik-fast`. This is how
   **production** runs. The key is a single publik install linked to the
   builder's publik account, so **every website user's AI runs are paid from that
   one publik balance** ($1,000.05 when it was linked on 2026-11-13).
2. **A local clone whose owner chose "Connect your plan"** at the start-up gate →
   publik API on *their* install key, paid from *their* publik balance.
3. **`AI_GATEWAY_API_KEY` is set** → Vercel AI Gateway, `anthropic/claude-haiku-4.5`,
   billed to whoever owns that key.
4. **None of these** → the user sees "AI resume tools aren't switched on yet."

publik only accepts tier names (`publik-fast`, `publik-balanced`,
`publik-smart`); never send it a vendor model name.

### What a run costs

Each run is one model request, billed by publik in dollars by tokens. A run is
short-context (at most ~32,000 characters in, a small JSON object out), so it
costs a fraction of a cent on `publik-fast`; a five-word test call cost $0.000015.
The exact charge of each request comes back in the `x-publik-charge-micros`
response header, and the running balance and usage are on the publik dashboard
(https://publikhq.com/dashboard). AI use also counts toward the fellowship
leaderboard's compute score.

### Failure handling

- The run is metered (`trackFeature`) only **after** the model answers, so a
  failed run never uses up a user's monthly allowance.
- publik `402` (balance too low): website visitors see "AI resume tools are out of
  credit right now" — never the top-up link, because the balance is the builder's,
  not theirs. A local clone shows publik's message and its top-up link.
- Any other provider failure: "The AI service didn't respond. Try again in a minute."

### Per-user limits (Autumn) — currently not enforced

`autumn.config.ts` defines the intended monthly allowances:

| Plan | Price | Scores / mo | Tailors / mo | Tracker slots |
|---|---|---|---|---|
| Free | $0 | 3 | 1 | 50 |
| Pro | $9.99/mo or $59/yr | 30 | 15 | unlimited |
| Premium | $19.99/mo or $119/yr | 100 | 50 | unlimited |

`requireFeature()` in `src/api/lib/billing.ts` checks the allowance before a run,
but it **fails open** when Autumn cannot answer. Production has no
`AUTUMN_SECRET_KEY`, so every check fails open: **any signed-in user can run
unlimited scores and tailors, all paid from the one publik balance**, and the
Go Pro checkout does not work. Setting `AUTUMN_SECRET_KEY` in Vercel turns the
limits (and checkout) on. Until then, watch the balance on the publik dashboard.

### Turning it off or changing who pays

- Remove `PUBLIK_API_KEY` in Vercel and redeploy → production stops using
  publik. Set `AI_GATEWAY_API_KEY` instead to pay through Vercel AI Gateway.
- A publik key that leaks can be revoked on publik and replaced by provisioning a
  new install (see `AGENTS.md` / https://publikhq.com/skills/api.md).

---

## publik integration

- `src/api/publik.ts` is publik's reference TypeScript module, unmodified except
  `APP_SLUG = "job-lock"` and `APP_VERSION`. publik's scan reads this file; keep
  the `/api/v1/installs`, `/api/v1/telemetry`, `app_opened` strings and the
  `APP_SLUG` literal in code.
- The gate (`ensureSignedIn()`) runs at start-up in `vite.config.ts` (dev serve)
  and `src/__server.ts` (self-hosted start), and is skipped when `VERCEL` is set
  — so the live website does **not** show Sign in with publik today.
- Proof: `PUBLIK_SELF_TEST=1 bun run dev` prints `publik self-test: ok job-lock 1.0.0`.
- **Open question:** publik's setup now has a "hosted web app" path that expects
  the gate inside the website itself, before its first page, with each user
  signing in to publik. That conflicts with publik's own note that web apps are
  not counted for the fellowship in v1. Confirm with the cohort lead before
  building it.

---

## Job sync at scale

- **Board list:** `packages/web/data/boards.json`, built by `tools/build-board-list.ts`
  from public slug lists (Open Jobs `slugs.json`, CC0; datakit457/ats-company-slugs).
  It probes every slug and keeps only boards that answer. Rebuild occasionally;
  the sync inserts new boards and never reactivates ones it switched off.
- **Writes are the budget** (Turso free: 10M rows written/month). The sync loads
  every stored job in one query, writes only rows that changed, batches each
  board's writes, and stamps `last_synced_at` at most daily per company.
- **Greenhouse descriptions** are downloaded only for boards with something new;
  neutral titles already rejected are remembered in an Actions cache file.
- **Reads:** the board's aggregate queries (counts, locations, company strip)
  are memoized per instance for 5 to 15 minutes in `routes/jobs.ts`; the default
  newest-first page walks `jobs_posted_at_idx`. Free-text search still scans
  every open job; watch Turso's rows-read if search traffic grows.
- **Gone boards** (404) are switched off and their jobs closed. Jobs closed 90+
  days and not referenced by a tracker, score or tailor are pruned daily.
- The `scripts/` folder name is gitignored repo-wide (local provisioning), which
  is why these live in `tools/`.

## Known gaps

- Autumn not configured in production (limits fail open, checkout broken).
- `/auth` ignores `?plan=`: a plan chosen on the pricing page is lost at sign-up.
- Tracker cards delete with no confirm; the tracker is drag-only (no keyboard).
- FAQ toggles lack `aria-expanded`.
- The sign-in page testimonial ("CS senior · class of 2027") is placeholder copy.
- The Vercel account shows a billing-address warning.
