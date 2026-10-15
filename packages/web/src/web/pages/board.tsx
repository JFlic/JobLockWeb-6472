import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Check,
  ExternalLink,
  Globe2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
import { Dialog } from "../components/ui/dialog";
import { EmptyState, ErrorNote, Skeleton, Spinner } from "../components/ui/feedback";
import { useJobLocations, useJobStats, useJobs, type JobFilters } from "../queries/jobs";
import { useTrackedJobIds, useTrackJob } from "../queries/applications";
import { useCurrentResume, useScoreResume } from "../queries/resume";
import { formatBalance, useUsage } from "../queries/billing";
import { initials, levelLabel, markColor, relativeTime } from "../lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 24;

type ScoreResult = {
  score: number;
  verdict: string;
  missingKeywords: string[];
  suggestions: { original: string; rewrite: string; why: string }[];
  jobTitle: string;
  companyName: string;
};

function ScoreRing({ score }: { score: number }) {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const tone = score >= 80 ? "#0F9D76" : score >= 60 ? "#1D4ED8" : score >= 40 ? "#D9820A" : "#D63B3B";
  return (
    <div className="relative size-[104px] shrink-0">
      <svg viewBox="0 0 100 100" className="size-[104px] -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#E2E8F2" strokeWidth="11" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${(circumference * score) / 100} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[26px] font-bold leading-none text-ink">{score}</span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          match
        </span>
      </div>
    </div>
  );
}

export default function BoardPage() {
  const [draftQuery, setDraftQuery] = useState("");
  const [filters, setFilters] = useState<JobFilters>({ sort: "newest", limit: PAGE_SIZE, offset: 0 });
  const [scoreJob, setScoreJob] = useState<{ id: number; title: string } | null>(null);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [scoreError, setScoreError] = useState<string | undefined>();

  // Debounce the search box into the query.
  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((f) => ({ ...f, query: draftQuery.trim() || undefined, offset: 0 }));
    }, 300);
    return () => clearTimeout(id);
  }, [draftQuery]);

  const jobsQuery = useJobs(filters);
  const stats = useJobStats();
  const locations = useJobLocations();
  const tracked = useTrackedJobIds();
  const trackJob = useTrackJob();
  const resume = useCurrentResume();
  const usage = useUsage();
  const score = useScoreResume();

  const trackedSet = useMemo(() => new Set(tracked.data ?? []), [tracked.data]);
  const jobs = jobsQuery.data?.jobs ?? [];
  const total = jobsQuery.data?.total ?? 0;
  const page = Math.floor((filters.offset ?? 0) / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const activeFilterCount = [
    filters.level,
    filters.location,
    filters.remote,
    filters.sponsorsVisa,
    filters.postedWithinDays,
  ].filter((v) => v !== undefined).length;

  function patch(next: Partial<JobFilters>) {
    setFilters((f) => ({ ...f, ...next, offset: 0 }));
  }

  async function runScore(job: { id: number; title: string }) {
    setScoreJob(job);
    setScoreResult(null);
    setScoreError(undefined);
    if (!resume.data) return;
    try {
      const result = await score.mutateAsync({ jobId: job.id });
      setScoreResult(result);
    } catch (e) {
      setScoreError(
        (e as Error).message || "Scoring failed. You may be out of scores for this month.",
      );
    }
  }

  return (
    <AppShell
      title="Job board"
      subtitle={
        stats.isLoading
          ? "Loading the feed…"
          : `${stats.data?.openJobs ?? 0} open roles · ${stats.data?.postedThisWeek ?? 0} posted this week · synced ${relativeTime(stats.data?.lastSyncedAt)}`
      }
      actions={
        <Badge tone="mint" className="hidden sm:inline-flex">
          <RefreshCw className="size-3" />
          live feed
        </Badge>
      }
    >
      <div className="mx-auto max-w-5xl space-y-5">
        {/* Filter bar */}
        <div className="jl-card space-y-3 bg-card p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={draftQuery}
              onChange={(e) => setDraftQuery(e.target.value)}
              placeholder="Search title, company or summary…"
              className="h-11 pl-9"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              value={filters.level ?? ""}
              onChange={(e) => patch({ level: (e.target.value || undefined) as JobFilters["level"] })}
            >
              <option value="">Any level</option>
              <option value="intern">Internship</option>
              <option value="new_grad">New grad</option>
              <option value="junior">Junior</option>
              <option value="other">Other</option>
            </Select>

            <Select
              value={filters.location ?? ""}
              onChange={(e) => patch({ location: e.target.value || undefined })}
            >
              <option value="">Any location</option>
              {(locations.data ?? []).map((l) => (
                <option key={l.location} value={l.location!}>
                  {l.location} ({l.total})
                </option>
              ))}
            </Select>

            <Select
              value={filters.postedWithinDays ? String(filters.postedWithinDays) : ""}
              onChange={(e) =>
                patch({ postedWithinDays: e.target.value ? Number(e.target.value) : undefined })
              }
            >
              <option value="">Any time</option>
              <option value="3">Last 3 days</option>
              <option value="7">Last week</option>
              <option value="30">Last month</option>
            </Select>

            <Select
              value={filters.sort ?? "newest"}
              onChange={(e) => patch({ sort: e.target.value as JobFilters["sort"] })}
            >
              <option value="newest">Newest first</option>
              <option value="company">By company</option>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => patch({ remote: filters.remote ? undefined : true })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition",
                filters.remote
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <Globe2 className="size-3.5" />
              Remote only
            </button>
            <button
              type="button"
              onClick={() => patch({ sponsorsVisa: filters.sponsorsVisa ? undefined : true })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition",
                filters.sponsorsVisa
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <Check className="size-3.5" />
              Sponsors a visa
            </button>

            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={() => setFilters({ sort: "newest", limit: PAGE_SIZE, offset: 0 })}
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground transition hover:text-destructive"
              >
                <X className="size-3.5" />
                Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
              </button>
            ) : null}

            <span className="ml-auto font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {jobsQuery.isFetching ? "searching…" : `${total} result${total === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>

        {/* Free-plan nudge */}
        {usage.data && !usage.data.resumeScore.unlimited && usage.data.resumeScore.remaining <= 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-amber/30 bg-amber/8 px-4 py-3">
            <Sparkles className="size-4 shrink-0 text-amber" />
            <p className="flex-1 text-[13.5px] text-foreground">
              You're out of resume scores this month. Tracking and browsing still work.
            </p>
            <Button asChild size="sm" className="rounded-[9px] font-semibold">
              <Link to="/pricing">Upgrade</Link>
            </Button>
          </div>
        ) : null}

        {/* Results */}
        {jobsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[106px]" />
            ))}
          </div>
        ) : jobsQuery.isError ? (
          <ErrorNote message="Couldn't load jobs. Refresh the page to try again." />
        ) : jobs.length === 0 ? (
          <EmptyState
            title="Nothing matches those filters"
            body="Try widening the level or clearing the location — the board refreshes on a schedule, so new roles land throughout the day."
            action={
              <Button
                variant="outline"
                className="rounded-[10px]"
                onClick={() => {
                  setDraftQuery("");
                  setFilters({ sort: "newest", limit: PAGE_SIZE, offset: 0 });
                }}
              >
                Clear all filters
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const isTracked = trackedSet.has(job.id);
              const posted = job.postedAt ?? job.createdAt;
              const fresh = Date.now() - new Date(posted).getTime() < 3 * 86400000;

              return (
                <article key={job.id} className="jl-card jl-card-hover p-4">
                  <div className="flex gap-3.5">
                    <div
                      className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-[14px] font-bold text-white"
                      style={{ background: markColor(job.companyName) }}
                    >
                      {initials(job.companyName)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[15.5px] font-semibold leading-snug text-ink">
                          {job.title}
                        </h2>
                        {fresh ? <Badge tone="mint">Just added</Badge> : null}
                        <Badge tone="blue">{levelLabel(job.level)}</Badge>
                        {job.remote ? <Badge tone="sky">Remote</Badge> : null}
                        {job.sponsorsVisa ? <Badge tone="gray">Visa</Badge> : null}
                      </div>

                      <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        {job.companyName}
                        {job.location ? (
                          <>
                            {" · "}
                            <MapPin className="mb-0.5 inline size-3" /> {job.location}
                          </>
                        ) : null}
                        {" · "}
                        {relativeTime(posted)}
                      </p>

                      {job.summary ? (
                        <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-muted-foreground">
                          {job.summary}
                        </p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant={isTracked ? "secondary" : "default"}
                          disabled={isTracked || trackJob.isPending}
                          onClick={() => trackJob.mutate({ jobId: job.id, status: "saved" })}
                          className="rounded-[9px] font-semibold"
                        >
                          {isTracked ? (
                            <>
                              <Check className="size-3.5" /> Tracking
                            </>
                          ) : (
                            <>
                              <Plus className="size-3.5" /> Track
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void runScore({ id: job.id, title: job.title })}
                          className="rounded-[9px] font-semibold"
                        >
                          <Sparkles className="size-3.5" />
                          Score my resume
                        </Button>

                        <a
                          href={job.applyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            if (!isTracked) trackJob.mutate({ jobId: job.id, status: "applied" });
                          }}
                          className="inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-2 text-[13px] font-semibold text-primary transition hover:bg-accent"
                        >
                          Apply
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}

            {/* Pagination */}
            {pages > 1 ? (
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() =>
                    setFilters((f) => ({ ...f, offset: Math.max(0, (f.offset ?? 0) - PAGE_SIZE) }))
                  }
                  className="rounded-[9px]"
                >
                  Previous
                </Button>
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  page {page} of {pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pages}
                  onClick={() => {
                    setFilters((f) => ({ ...f, offset: (f.offset ?? 0) + PAGE_SIZE }));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="rounded-[9px]"
                >
                  Next
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Score dialog */}
      <Dialog
        open={scoreJob !== null}
        onClose={() => {
          setScoreJob(null);
          setScoreResult(null);
          setScoreError(undefined);
        }}
        title="Resume match score"
        description={scoreJob?.title}
        className="max-w-xl"
      >
        {resume.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner /> Checking your saved resume…
          </div>
        ) : !resume.data ? (
          <div className="space-y-4">
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              Upload a resume once and you can score it against any job on the board.
            </p>
            <Button asChild className="w-full rounded-[10px] font-semibold">
              <Link to="/resume">Upload a resume</Link>
            </Button>
          </div>
        ) : score.isPending ? (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Reading the posting against {resume.data.filename}…
            </div>
            <Skeleton className="h-24" />
            <Skeleton className="h-16" />
          </div>
        ) : scoreError ? (
          <div className="space-y-4">
            <ErrorNote message={scoreError} />
            <p className="text-[13px] text-muted-foreground">
              Scores left this month: {formatBalance(usage.data?.resumeScore)}
            </p>
            <Button asChild variant="outline" className="w-full rounded-[10px] font-semibold">
              <Link to="/pricing">See plans</Link>
            </Button>
          </div>
        ) : scoreResult ? (
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <ScoreRing score={scoreResult.score} />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-ink">
                  {scoreResult.companyName} · {scoreResult.jobTitle}
                </p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                  {scoreResult.verdict}
                </p>
              </div>
            </div>

            {scoreResult.missingKeywords.length > 0 ? (
              <div>
                <p className="eyebrow text-muted-foreground">Missing keywords</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {scoreResult.missingKeywords.map((k) => (
                    <Badge key={k} tone="amber">
                      {k}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {scoreResult.suggestions.length > 0 ? (
              <div className="space-y-2.5">
                <p className="eyebrow text-muted-foreground">Suggested rewrites</p>
                {scoreResult.suggestions.map((s, i) => (
                  <div key={i} className="rounded-[10px] border border-border bg-surface p-3">
                    <p className="text-[12.5px] leading-relaxed text-muted-foreground line-through">
                      {s.original}
                    </p>
                    <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-foreground">
                      {s.rewrite}
                    </p>
                    <p className="mt-2 border-t border-border/70 pt-2 text-xs leading-relaxed text-muted-foreground">
                      {s.why}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            <p className="border-t border-border pt-3 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
              {formatBalance(usage.data?.resumeScore)} this month
            </p>
          </div>
        ) : null}
      </Dialog>
    </AppShell>
  );
}
