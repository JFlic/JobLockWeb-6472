# Job Lock — Design

Job Lock is a web app for new-grad and junior software engineers: a curated job board refreshed straight from company ATS feeds, a kanban application tracker, and AI resume tools (match score + truthful tailoring). Positioning line: **"Lock in and apply."** Web only for now.

Visual direction follows Intern Dock: bright, airy, optimistic marketing pages with a sky-blue gradient hero, and a dense, confident navy/blue product dashboard behind sign-in. Marketing feels like a launch announcement; the app feels like a tool you use daily.

## Brand & Colors

CSS variables in `packages/web/src/web/styles.css`. Light mode is the product; no dark mode toggle for v1 (dark tokens stay defined but unused).

| Token | Value | Use |
|-------|-------|-----|
| primary | `#1D4ED8` (blue-700) | Buttons, active nav, links, focus rings |
| primaryHover | `#1A3FB4` | Button hover |
| ink | `#0B1220` | Headlines, dashboard sidebar background |
| navy | `#132542` | Secondary dark surfaces, mockup chrome |
| foreground | `#16203A` | Body text |
| mutedForeground | `#5B6B87` | Secondary text, meta rows |
| background | `#FFFFFF` | Page background |
| surface | `#F5F8FD` | Alternating sections, board filter bar |
| card | `#FFFFFF` | Job cards, kanban cards, pricing cards |
| border | `#E2E8F2` | Hairlines, card outlines |
| sky | `#7FB3F5` → `#DCEBFC` | Hero gradient (top → bottom), badge fills |
| accentMint | `#0F9D76` | "Just added" / live / success states |
| accentAmber | `#D9820A` | Deadlines, streaks, limit warnings |
| destructive | `#D63B3B` | Rejected column, errors, delete |

Gradient hero: vertical `#6FA8F0 → #BEDAFA → #FFFFFF`, with soft white cloud-like radial blooms layered over it. No purple anywhere.

## Typography

- **Display**: Poppins (600/700) — hero headline, section headings, pricing numbers. Loaded from Google Fonts in `styles.css`.
- **Body**: Poppins (400/500) for UI text; tight tracking on large display sizes (`-0.02em`).
- **Mono accents**: `ui-monospace` for small uppercase eyebrow labels (letter-spacing `0.12em`) and job metadata timestamps.
- Hero headline clamps 2.75rem → 4.75rem. Section headings 2rem → 2.75rem. Body 1rem/1.65.

## Pages

Marketing (public):
- **Home** (`pages/index.tsx`) — sky-gradient hero with rotating season/role word, floating dashboard mockup panel, "Updated hourly" live badge, company logo strip, four alternating feature blocks (board / tracker / resume score / tailoring), testimonials, FAQ accordion, CTA band.
- **Pricing** (`pages/pricing.tsx`) — eyebrow + headline, monthly/annual toggle, three plan cards (Free, Pro, Premium — Pro flagged "Most popular"), stats band, full feature comparison table, FAQ, CTA.

Auth:
- **Sign in / Sign up** (`pages/auth.tsx`) — single page, tab switch, email+password plus Google. Split layout: form left, gradient panel with product proof right.

App (authenticated, shared sidebar shell):
- **Job Board** (`pages/board.tsx`) — search, filter row (level, location, remote, sponsorship, posted), "Just added" section, job cards with company mark, meta row, `+ Track` and `Score my resume` actions.
- **Tracker** (`pages/tracker.tsx`) — stats header (applied this week, streak, response rate), five-column kanban (Saved, Applied, Interviewing, Offer, Rejected) with drag-and-drop, add-manual-application dialog, usage/limit banner on Free.
- **Resume** (`pages/resume.tsx`) — upload .docx or PDF, saved resume preview, experience notes (extra true facts, importable from old cover letters), target a board job or a pasted posting, score panel (0–100 ring, missing keywords, three bullet rewrites), tailoring side-by-side diff with per-bullet approve plus an editable cover letter, Word downloads of both (a .docx upload keeps its own formatting), and a history of tailored applications. Board and tracker cards deep-link here with `Tailor`.

## Components

- **Buttons**: primary solid blue, radius `10px`, `font-weight 600`, subtle shadow `0 1px 2px rgba(16,32,64,.12)`; secondary = white with border; ghost for nav.
- **Cards**: white, `1px` border, radius `14px`, shadow on hover only (`0 8px 24px -12px rgba(15,35,75,.22)`) with `translateY(-2px)`.
- **Badges**: pill, `11px` uppercase mono; mint = just added/live, blue = level, amber = deadline, gray = meta.
- **Kanban cards**: left 3px status stripe, company + title, applied date, drag cursor.
- **Pricing cards**: equal height; Pro raised with blue ring + "Most popular" ribbon.
- **Sidebar**: `#0B1220` background, grouped nav labels in mono uppercase, active item = blue fill.
- **Empty states**: illustration-free but never bare — one line of copy plus the action that fixes it.

## Motion

One orchestrated page load per marketing page: staggered fade-and-rise (`opacity 0→1`, `translateY 18px→0`, 60ms stagger) via the Motion library on hero elements, then scroll-triggered reveals once per section. App pages skip entrance animation; interactions (drag, status change, score reveal) animate instead. Respect `prefers-reduced-motion`.

## Key User Flows

1. **Discover → apply → track**: land on home → Browse board → filter to new-grad remote → `+ Track` (adds to Saved) → click Apply (opens company ATS in a new tab) → "Did you apply?" prompt on return → card moves to Applied with timestamp, streak increments.
2. **Score a resume**: upload PDF once on `/resume` → open any job → "Score my resume" → 0–100 with missing keywords and three rewrites → counts against the plan's monthly score allowance.
3. **Hit a limit → upgrade**: Free user exhausts scores or the 50-application cap → inline banner with what's blocked → `/pricing` → Autumn `attach()` → checkout → limits lift immediately.

## Architecture

- **API**: oRPC procedures in `packages/web/src/api/routes/` (`jobs`, `applications`, `resume`, `companies`), consumed through `src/web/queries/*` with TanStack Query.
- **Job ingestion**: `POST /api/cron/refresh-jobs` pulls Greenhouse / Lever / Ashby public endpoints, normalizes and upserts by `source_id`, closes vanished postings. Driven by an external schedule after deploy.
- **Auth**: Better Auth — email/password + Runable managed Google. `/board`, `/tracker`, `/resume` are gated client- and server-side.
- **Payments**: Autumn (`autumn.config.ts`) — Free / Pro / Premium with metered `resume_score` and `resume_tailor` features; every paid action checks balance on the server before running.
- **Uploads**: resume PDFs to Tigris via presigned PUT; text extracted server-side and stored on the resume row.
- **AI**: AI Gateway, `anthropic/claude-haiku-4.5`, structured JSON output. Hard rule surfaced in UI: the model never invents experience.
