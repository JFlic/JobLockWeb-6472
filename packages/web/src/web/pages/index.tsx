import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "motion/react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  KanbanSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { SiteFooter, SiteHeader } from "../components/site-chrome";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useJobStats, useCompanies } from "../queries/jobs";
import { compactNumber, initials, markColor, relativeTime } from "../lib/format";
import { cn } from "@/lib/utils";

const ROTATING = ["new grad", "junior SWE", "summer 2027", "backend", "first job"];

const rise = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={rise}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function RotatingWord() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % ROTATING.length), 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="relative inline-block min-w-[6ch] text-primary">
      <motion.span
        key={index}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="inline-block"
      >
        {ROTATING[index]}
      </motion.span>
    </span>
  );
}

function DashboardMockup() {
  const stats = useJobStats();
  const columns = [
    { label: "Saved", tone: "#6FA8F0", rows: ["Stripe · New grad SWE", "Ramp · Backend"] },
    { label: "Applied", tone: "#1D4ED8", rows: ["Figma · Product eng", "Notion · SWE I", "Vercel · Frontend"] },
    { label: "Interviewing", tone: "#D9820A", rows: ["Linear · New grad"] },
    { label: "Offer", tone: "#0F9D76", rows: [] },
  ];

  return (
    <div className="jl-card overflow-hidden border-border/70 shadow-[0_32px_80px_-40px_rgba(11,18,32,0.5)]">
      <div className="flex items-center gap-2 border-b border-border bg-navy px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-white/25" />
          <span className="size-2.5 rounded-full bg-white/25" />
          <span className="size-2.5 rounded-full bg-white/25" />
        </div>
        <p className="ml-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white/55">
          joblock.app / tracker
        </p>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-mint/20 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#5ce0b6]">
          <span className="size-1.5 animate-pulse rounded-full bg-[#5ce0b6]" />
          live
        </span>
      </div>

      <div className="bg-surface p-4">
        <div className="mb-3 grid grid-cols-3 gap-2">
          {[
            { k: "Open roles", v: compactNumber(stats.data?.openJobs) },
            { k: "Applied this week", v: "12" },
            { k: "Response rate", v: "31%" },
          ].map((s) => (
            <div key={s.k} className="rounded-[10px] border border-border bg-card px-3 py-2">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
                {s.k}
              </p>
              <p className="text-[17px] font-bold text-ink">{s.v}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {columns.map((col) => (
            <div key={col.label} className="rounded-[10px] bg-white/70 p-2">
              <p className="mb-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {col.label} · {col.rows.length}
              </p>
              <div className="space-y-1.5">
                {col.rows.map((row) => (
                  <div
                    key={row}
                    className="rounded-[8px] border border-border bg-card px-2 py-1.5 text-[10.5px] font-medium leading-snug text-foreground shadow-[0_1px_2px_rgba(16,32,64,0.06)]"
                    style={{ borderLeft: `3px solid ${col.tone}` }}
                  >
                    {row}
                  </div>
                ))}
                {col.rows.length === 0 ? (
                  <div className="rounded-[8px] border border-dashed border-border px-2 py-3 text-center text-[10px] text-muted-foreground">
                    soon
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    eyebrow: "The board",
    icon: Target,
    title: "Only the roles that will actually take you",
    body: "Every posting is pulled straight from the company's own job board and filtered down to intern, new-grad and junior software engineering. No recruiter spam, no senior listings padding the count, no dead links three weeks stale.",
    points: [
      "Greenhouse, Lever and Ashby feeds refreshed on a schedule",
      "Filter by level, location, remote and visa sponsorship",
      "Closed postings disappear automatically",
    ],
  },
  {
    eyebrow: "The tracker",
    icon: KanbanSquare,
    title: "One board instead of a spreadsheet you stopped updating",
    body: "Track a job in one click from the board and it lands in Saved. Drag it across Applied, Interviewing, Offer and Rejected as things move. Applied dates are stamped for you so your streak and response rate stay honest.",
    points: [
      "Five-column kanban with drag and drop",
      "Add roles you found elsewhere by hand",
      "Streak, weekly volume and response rate up top",
    ],
  },
  {
    eyebrow: "Resume score",
    icon: FileText,
    title: "Know if you're wasting an application before you send it",
    body: "Upload your resume once. Against any job on the board you get a 0–100 match score, the keywords the posting wants that you're missing, and three specific rewrites of lines you already have.",
    points: [
      "Scored against the real job description",
      "Missing-keyword list you can act on",
      "Verdict in two sentences, not a lecture",
    ],
  },
  {
    eyebrow: "Tailoring",
    icon: Sparkles,
    title: "Tailored bullets that don't invent a career you don't have",
    body: "Tailoring rewrites the bullets already on your resume into the language the posting uses. It never adds an employer, a date, a metric or a skill. You approve each change side by side before anything counts as final.",
    points: [
      "Side-by-side original vs tailored diff",
      "Per-bullet approve — nothing auto-applied",
      "Hard rule: no fabricated experience",
    ],
  },
];

const FAQ = [
  {
    q: "Where do the jobs come from?",
    a: "Directly from each company's public applicant tracking system — Greenhouse, Lever or Ashby. When you click apply you land on the company's own form, never a middleman. Postings that vanish from the source get closed here too.",
  },
  {
    q: "Is it really only junior roles?",
    a: "Ingestion drops anything that isn't software engineering and anything levelled above junior. Titles are classified into intern, new grad and junior, and you can filter to just the one you want.",
  },
  {
    q: "Will the AI make things up on my resume?",
    a: "No. Both the scoring and the tailoring prompts carry a hard rule against inventing experience, employers, dates, metrics, degrees or skills. If a posting wants something you don't have, it tells you that's a gap instead of writing fiction.",
  },
  {
    q: "What does the free plan actually include?",
    a: "Unlimited browsing, 50 tracker slots, 3 resume scores and 1 tailoring run a month. Enough to run a real search for a few weeks before deciding whether you want more.",
  },
  {
    q: "Do you store my resume?",
    a: "The PDF is stored so you can score against multiple jobs without re-uploading, and the extracted text is kept on your account. You can upload a new one any time and download what's saved.",
  },
  {
    q: "Can I cancel?",
    a: "Yes, any time, from the billing portal. Paid limits drop back to the free tier at the end of the period and your tracker data stays put.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="jl-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <span className="flex-1 text-[15px] font-semibold text-ink">{q}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition", open && "rotate-180")}
        />
      </button>
      {open ? (
        <p className="px-5 pb-5 text-[14.5px] leading-relaxed text-muted-foreground">{a}</p>
      ) : null}
    </div>
  );
}

export default function IndexPage() {
  const stats = useJobStats();
  const companies = useCompanies();
  const logoRow = (companies.data ?? []).slice(0, 14);

  return (
    <div className="min-h-screen bg-background">
      <div className="hero-sky">
        <SiteHeader variant="onSky" />

        <section className="mx-auto max-w-6xl px-5 pb-20 pt-12 sm:pt-16">
          <motion.div
            initial="hidden"
            animate="show"
            transition={{ staggerChildren: 0.06 }}
            className="mx-auto max-w-3xl text-center"
          >
            <motion.div variants={rise} transition={{ duration: 0.5 }}>
              <Badge tone="onDark" className="bg-ink/70 text-white/90 backdrop-blur">
                <RefreshCw className="size-3" />
                {stats.isLoading
                  ? "syncing feeds"
                  : `${stats.data?.openJobs ?? 0} open roles · synced ${relativeTime(stats.data?.lastSyncedAt)}`}
              </Badge>
            </motion.div>

            <motion.h1
              variants={rise}
              transition={{ duration: 0.55 }}
              className="mt-5 text-[clamp(2.75rem,7vw,4.75rem)] font-bold leading-[0.98] tracking-[-0.03em] text-ink"
            >
              Lock in and apply.
            </motion.h1>

            <motion.p
              variants={rise}
              transition={{ duration: 0.55 }}
              className="mx-auto mt-5 max-w-xl text-[17px] leading-[1.65] text-navy/80"
            >
              Every <RotatingWord /> software role, pulled straight from company job boards.
              Track applications on one board and have AI tell you which ones are worth your time.
            </motion.p>

            <motion.div
              variants={rise}
              transition={{ duration: 0.55 }}
              className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Button
                asChild
                size="lg"
                className="h-12 w-full rounded-[10px] px-7 text-[15px] font-semibold shadow-[0_8px_24px_-10px_rgba(29,78,216,0.8)] sm:w-auto"
              >
                <Link to="/auth?mode=signup">
                  Start free — no card
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 w-full rounded-[10px] border-ink/15 bg-white/85 px-7 text-[15px] font-semibold text-ink backdrop-blur hover:bg-white sm:w-auto"
              >
                <Link to="/board">Browse the board</Link>
              </Button>
            </motion.div>

            <motion.p
              variants={rise}
              transition={{ duration: 0.55 }}
              className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-navy/55"
            >
              {stats.data?.companies ?? 0} companies · {stats.data?.postedThisWeek ?? 0} posted
              this week
            </motion.p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 34 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto mt-14 max-w-4xl"
          >
            <DashboardMockup />
          </motion.div>
        </section>
      </div>

      {/* Logo strip */}
      <section className="border-y border-border bg-background py-8">
        <div className="mx-auto max-w-6xl px-5">
          <p className="eyebrow text-center text-muted-foreground">
            Hiring right now on Job Lock
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
            {companies.isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-6 w-24 animate-pulse rounded bg-muted" />
                ))
              : logoRow.map((c) => (
                  <span
                    key={c.id}
                    className="text-[15px] font-semibold tracking-tight text-muted-foreground/75"
                  >
                    {c.name}
                  </span>
                ))}
          </div>
        </div>
      </section>

      {/* Feature blocks */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <div>
            <p className="eyebrow text-primary">How it works</p>
            <h2 className="mt-3 text-[clamp(2rem,4vw,2.75rem)] font-bold leading-[1.08] tracking-[-0.025em] text-ink">
              Four tools, one job search
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
              Find the role, track where it went, and know before you hit submit whether your
              resume is close enough to bother.
            </p>
          </div>
        </Reveal>

        <div className="mt-16 space-y-20">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            const flipped = i % 2 === 1;
            return (
              <Reveal key={feature.title}>
                <div
                  className={cn(
                    "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
                    flipped && "lg:[&>*:first-child]:order-2",
                  )}
                >
                  <div>
                    <div className="inline-flex size-10 items-center justify-center rounded-[10px] bg-accent text-primary">
                      <Icon className="size-5" />
                    </div>
                    <p className="eyebrow mt-4 text-primary">{feature.eyebrow}</p>
                    <h3 className="mt-2 text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[30px]">
                      {feature.title}
                    </h3>
                    <p className="mt-4 text-[15.5px] leading-[1.7] text-muted-foreground">
                      {feature.body}
                    </p>
                    <ul className="mt-5 space-y-2.5">
                      {feature.points.map((point) => (
                        <li key={point} className="flex items-start gap-2.5 text-[14.5px] text-foreground">
                          <Check className="mt-0.5 size-4 shrink-0 text-mint" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <FeatureVisual index={i} />
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Proof band */}
      <section className="bg-ink py-16">
        <div className="mx-auto max-w-6xl px-5">
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                k: `${stats.data?.openJobs ?? 0}`,
                l: "junior-level roles open",
                s: "Filtered from tens of thousands of raw postings.",
              },
              {
                k: `${stats.data?.companies ?? 0}`,
                l: "companies tracked",
                s: "Pulled from their own applicant tracking systems.",
              },
              {
                k: `${stats.data?.postedThisWeek ?? 0}`,
                l: "posted in the last 7 days",
                s: "Fresh listings surface at the top of the board.",
              },
            ].map((item) => (
              <div key={item.l}>
                <p className="text-[40px] font-bold leading-none tracking-[-0.03em] text-white">
                  {item.k}
                </p>
                <p className="mt-2 text-[14.5px] font-semibold text-white/85">{item.l}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-white/50">{item.s}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Truth promise */}
      <section className="bg-surface py-20">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <Reveal>
            <div>
              <div className="mx-auto inline-flex size-11 items-center justify-center rounded-full bg-mint/12 text-mint">
                <ShieldCheck className="size-5" />
              </div>
              <h2 className="mt-5 text-[clamp(1.75rem,3.5vw,2.25rem)] font-bold leading-tight tracking-[-0.02em] text-ink">
                The AI never invents experience
              </h2>
              <p className="mt-4 text-[16px] leading-[1.7] text-muted-foreground">
                Plenty of tools will happily write you a resume bullet about a job you never had.
                Job Lock won't. Scoring and tailoring both work only from what's already in your
                resume — if a posting wants something you don't have, it says so as a gap. You stay
                the person who can defend every line in the interview.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 py-20">
        <Reveal>
          <div className="text-center">
            <p className="eyebrow text-primary">FAQ</p>
            <h2 className="mt-3 text-[clamp(2rem,4vw,2.5rem)] font-bold tracking-[-0.025em] text-ink">
              Questions worth asking
            </h2>
          </div>
        </Reveal>
        <div className="mt-10 space-y-3">
          {FAQ.map((item) => (
            <FaqItem key={item.q} {...item} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 pb-20">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-[20px] bg-primary px-6 py-14 text-center sm:px-14">
          <h2 className="text-[clamp(1.85rem,4vw,2.5rem)] font-bold leading-tight tracking-[-0.025em] text-white">
            Stop scrolling LinkedIn. Start applying.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15.5px] leading-relaxed text-white/80">
            Free forever for 50 applications, 3 resume scores a month and the full board. No card,
            no trial timer.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-7 h-12 rounded-[10px] bg-white px-8 text-[15px] font-semibold text-primary hover:bg-white/90"
          >
            <Link to="/auth?mode=signup">
              Create your account
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

/** Lightweight illustrative panels for each feature block. */
function FeatureVisual({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="jl-card space-y-2.5 bg-surface p-4">
        {[
          { c: "Stripe", t: "New Grad Software Engineer", m: "Remote · US", tag: "New grad", tone: "mint" as const },
          { c: "Ramp", t: "Software Engineer, Backend", m: "New York, NY", tag: "Junior", tone: "blue" as const },
          { c: "Figma", t: "Software Engineer Intern", m: "San Francisco, CA", tag: "Intern", tone: "sky" as const },
        ].map((job) => (
          <div key={job.c} className="jl-card jl-card-hover flex items-center gap-3 p-3">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-[9px] text-[12px] font-bold text-white"
              style={{ background: markColor(job.c) }}
            >
              {initials(job.c)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-ink">{job.t}</p>
              <p className="truncate font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                {job.c} · {job.m}
              </p>
            </div>
            <Badge tone={job.tone}>{job.tag}</Badge>
          </div>
        ))}
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="jl-card grid grid-cols-3 gap-2 bg-surface p-4">
        {[
          { l: "Saved", tone: "#6FA8F0", n: 8 },
          { l: "Applied", tone: "#1D4ED8", n: 14 },
          { l: "Interviewing", tone: "#D9820A", n: 3 },
        ].map((col) => (
          <div key={col.l} className="rounded-[10px] bg-white p-2">
            <p className="mb-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {col.l} · {col.n}
            </p>
            <div className="space-y-1.5">
              {Array.from({ length: Math.min(col.n, 3) }).map((_, i) => (
                <div
                  key={i}
                  className="h-9 rounded-[8px] border border-border bg-card"
                  style={{ borderLeft: `3px solid ${col.tone}` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="jl-card bg-surface p-6">
        <div className="flex items-center gap-5">
          <div className="relative size-24 shrink-0">
            <svg viewBox="0 0 100 100" className="size-24 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#E2E8F2" strokeWidth="11" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="#1D4ED8"
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 42 * 0.78} ${2 * Math.PI * 42}`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[22px] font-bold leading-none text-ink">78</span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                match
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-ink">Worth applying after tailoring</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              Strong on backend fundamentals, light on the distributed systems language the
              posting leans on.
            </p>
          </div>
        </div>
        <div className="mt-5">
          <p className="eyebrow text-muted-foreground">Missing keywords</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Kubernetes", "gRPC", "observability", "Go", "on-call"].map((k) => (
              <Badge key={k} tone="amber">
                {k}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="jl-card space-y-3 bg-surface p-4">
      <div className="rounded-[10px] border border-border bg-card p-3">
        <p className="eyebrow text-muted-foreground">Original</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground line-through decoration-destructive/40">
          Worked on a web app for a class project using React and a database.
        </p>
      </div>
      <div className="rounded-[10px] border border-mint/30 bg-mint/6 p-3">
        <p className="eyebrow text-mint">Tailored</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">
          Built a React front end backed by a relational schema, shipping the full CRUD flow for a
          40-person course project.
        </p>
        <div className="mt-3 flex gap-2">
          <span className="inline-flex items-center gap-1 rounded-[8px] bg-mint px-2.5 py-1 text-[11.5px] font-semibold text-white">
            <Check className="size-3" /> Approve
          </span>
          <span className="inline-flex items-center rounded-[8px] border border-border bg-card px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground">
            Skip
          </span>
        </div>
      </div>
    </div>
  );
}
