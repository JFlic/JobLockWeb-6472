import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Check,
  Copy,
  Download,
  FileText,
  Search,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { EmptyState, ErrorNote, Skeleton, Spinner } from "../components/ui/feedback";
import { useJobs } from "../queries/jobs";
import {
  useApproveChanges,
  useCurrentResume,
  useDownloadResume,
  useResumeHistory,
  useScoreResume,
  useTailorResume,
  useUploadResume,
} from "../queries/resume";
import { formatBalance, useUsage } from "../queries/billing";
import { initials, levelLabel, markColor, relativeTime, shortDate } from "../lib/format";
import { cn } from "@/lib/utils";

type PickedJob = { id: number; title: string; companyName: string };

type ScoreResult = {
  score: number;
  verdict: string;
  missingKeywords: string[];
  suggestions: { original: string; rewrite: string; why: string }[];
  jobTitle: string;
  companyName: string;
};

type TailorResult = {
  id: number;
  jobTitle: string;
  companyName: string;
  changes: { section: string; original: string; tailored: string; rationale: string }[];
};

function scoreTone(score: number) {
  if (score >= 80) return "#0F9D76";
  if (score >= 60) return "#1D4ED8";
  if (score >= 40) return "#D9820A";
  return "#D63B3B";
}

function ScoreRing({ score, size = 116 }: { score: number; size?: number }) {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="-rotate-90" style={{ width: size, height: size }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#E2E8F2" strokeWidth="11" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={scoreTone(score)}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${(circumference * score) / 100} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[28px] font-bold leading-none text-ink">{score}</span>
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          match
        </span>
      </div>
    </div>
  );
}

/** Search-and-pick one live posting to run the AI tools against. */
function JobPicker({
  picked,
  onPick,
}: {
  picked: PickedJob | null;
  onPick: (job: PickedJob | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setQuery(draft.trim()), 300);
    return () => clearTimeout(id);
  }, [draft]);

  const results = useJobs({ query: query || undefined, sort: "newest", limit: 8, offset: 0 });

  if (picked) {
    return (
      <div className="flex items-center gap-3 rounded-[12px] border border-border bg-sky-1 px-3.5 py-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-[9px] text-[11px] font-bold text-white"
          style={{ backgroundColor: markColor(picked.companyName) }}
        >
          {initials(picked.companyName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{picked.title}</p>
          <p className="truncate text-xs text-muted-foreground">{picked.companyName}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear selected job"
          onClick={() => {
            onPick(null);
            setDraft("");
            setOpen(false);
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search a posting — company or title"
        className="pl-9"
      />
      {open ? (
        <div className="jl-scroll absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-[320px] overflow-y-auto rounded-[12px] border border-border bg-card p-1.5 shadow-[0_20px_44px_-20px_rgba(11,18,32,0.35)]">
          {results.isPending ? (
            <div className="space-y-1.5 p-1.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (results.data?.jobs.length ?? 0) === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No open roles match that.
            </p>
          ) : (
            results.data!.jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => {
                  onPick({ id: job.id, title: job.title, companyName: job.companyName });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-[9px] px-2.5 py-2 text-left transition hover:bg-muted"
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-[8px] text-[10px] font-bold text-white"
                  style={{ backgroundColor: markColor(job.companyName) }}
                >
                  {initials(job.companyName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {job.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {job.companyName} · {levelLabel(job.level)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function UploadCard() {
  const resume = useCurrentResume();
  const upload = useUploadResume();
  const download = useDownloadResume();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleFile(file?: File | null) {
    if (!file) return;
    setError(undefined);
    try {
      await upload.mutateAsync(file);
    } catch (e) {
      setError((e as Error).message || "Upload failed.");
    }
  }

  return (
    <section className="jl-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Your resume</p>
          <h2 className="mt-1.5 text-lg font-semibold text-foreground">
            One PDF powers every tool
          </h2>
        </div>
        {resume.data ? (
          <Badge tone="mint">
            <Check className="size-3" />
            Ready
          </Badge>
        ) : null}
      </div>

      {resume.isPending ? (
        <Skeleton className="mt-5 h-[136px] w-full" />
      ) : resume.data ? (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-sky-1 px-4 py-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-primary/10 text-primary">
              <FileText className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {resume.data.filename}
              </p>
              <p className="text-xs text-muted-foreground">
                {resume.data.characters.toLocaleString()} characters read ·{" "}
                {relativeTime(resume.data.createdAt)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => download.mutate(resume.data!.id)}
                disabled={download.isPending}
              >
                {download.isPending ? <Spinner /> : <Download className="size-4" />}
                Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={upload.isPending}
              >
                {upload.isPending ? <Spinner /> : <Upload className="size-4" />}
                Replace
              </Button>
            </div>
          </div>

          {resume.data.characters < 400 ? (
            <ErrorNote message="We only read a little text from that PDF. If it was exported as an image, re-export it as a text-based PDF so the AI can work with it." />
          ) : (
            <div className="rounded-[12px] border border-border bg-muted/40 p-4">
              <p className="eyebrow">What we read</p>
              <p className="mt-2 line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                {resume.data.preview}
              </p>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFile(e.dataTransfer.files?.[0]);
          }}
          disabled={upload.isPending}
          className={cn(
            "mt-5 flex w-full flex-col items-center gap-2 rounded-[14px] border-2 border-dashed px-6 py-12 text-center transition",
            dragging
              ? "border-primary bg-sky-2"
              : "border-border bg-sky-1/60 hover:border-primary/50 hover:bg-sky-1",
          )}
        >
          <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
            {upload.isPending ? <Spinner className="size-5" /> : <Upload className="size-5" />}
          </span>
          <span className="text-sm font-semibold text-foreground">
            {upload.isPending ? "Reading your resume…" : "Drop your resume PDF here"}
          </span>
          <span className="text-xs text-muted-foreground">
            or click to browse · PDF only, up to 8MB
          </span>
        </button>
      )}

      {error ? <ErrorNote className="mt-4" message={error} /> : null}

      <input
        ref={inputRef}
        type="file"
        aria-label="Upload resume PDF"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </section>
  );
}

function ScorePanel({ result }: { result: ScoreResult }) {
  return (
    <div className="mt-5 rounded-[14px] border border-border bg-card p-5">
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <ScoreRing score={result.score} />
        <div className="min-w-0">
          <p className="eyebrow">
            {result.jobTitle} · {result.companyName}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{result.verdict}</p>
        </div>
      </div>

      {result.missingKeywords.length > 0 ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="eyebrow">Missing from your resume</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {result.missingKeywords.map((keyword) => (
              <Badge key={keyword} tone="amber">
                {keyword}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {result.suggestions.length > 0 ? (
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          <p className="eyebrow">Suggested rewrites</p>
          {result.suggestions.map((suggestion, i) => (
            <div key={i} className="rounded-[12px] border border-border bg-muted/40 p-3.5">
              <p className="text-xs leading-relaxed text-muted-foreground line-through decoration-muted-foreground/40">
                {suggestion.original}
              </p>
              <p className="mt-2 text-sm font-medium leading-relaxed text-foreground">
                {suggestion.rewrite}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{suggestion.why}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TailorPanel({ result }: { result: TailorResult }) {
  const [approved, setApproved] = useState<number[]>(() => result.changes.map((_, i) => i));
  const [copied, setCopied] = useState(false);
  const approve = useApproveChanges();

  const approvedSet = useMemo(() => new Set(approved), [approved]);

  function toggle(index: number) {
    setApproved((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
    );
  }

  async function copyApproved() {
    const text = result.changes
      .filter((_, i) => approvedSet.has(i))
      .map((change) => `• ${change.tailored}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="mt-5 rounded-[14px] border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">
            Tailored for {result.jobTitle} · {result.companyName}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {approved.length} of {result.changes.length} changes kept. Every line is a rewrite of
            your own work — nothing new was added.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void copyApproved()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy kept lines"}
          </Button>
          <Button
            size="sm"
            onClick={() => approve.mutate({ id: result.id, approved })}
            disabled={approve.isPending}
          >
            {approve.isPending ? <Spinner /> : null}
            {approve.isSuccess ? "Saved" : "Save selection"}
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {result.changes.map((change, i) => {
          const isApproved = approvedSet.has(i);
          return (
            <div
              key={i}
              className={cn(
                "rounded-[12px] border p-4 transition",
                isApproved ? "border-primary/35 bg-sky-1" : "border-border bg-muted/30 opacity-70",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <Badge tone={isApproved ? "blue" : "gray"}>{change.section}</Badge>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  className={cn(
                    "jl-pill transition",
                    isApproved
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-border",
                  )}
                >
                  {isApproved ? <Check className="size-3" /> : <X className="size-3" />}
                  {isApproved ? "Keeping" : "Skipped"}
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Before
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {change.original}
                  </p>
                </div>
                <div className="sm:border-l sm:border-border sm:pl-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-primary">
                    After
                  </p>
                  <p className="mt-1.5 text-sm font-medium leading-relaxed text-foreground">
                    {change.tailored}
                  </p>
                </div>
              </div>

              <p className="mt-3 border-t border-border/70 pt-2.5 text-xs text-muted-foreground">
                {change.rationale}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryCard() {
  const history = useResumeHistory();

  return (
    <section className="jl-card p-5">
      <p className="eyebrow">Score history</p>
      {history.isPending ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (history.data?.length ?? 0) === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nothing scored yet. Pick a posting and run your first match.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {history.data!.map((run) => (
            <li
              key={run.id}
              className="flex items-center gap-3 rounded-[11px] border border-border px-3 py-2.5"
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white"
                style={{ backgroundColor: scoreTone(run.score) }}
              >
                {run.score}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {run.jobTitle ?? "Removed posting"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {run.companyName ?? "—"} · {shortDate(run.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function ResumePage() {
  const resume = useCurrentResume();
  const usage = useUsage();
  const score = useScoreResume();
  const tailor = useTailorResume();

  const [job, setJob] = useState<PickedJob | null>(null);
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [tailorResult, setTailorResult] = useState<TailorResult | null>(null);
  const [error, setError] = useState<string | undefined>();

  const hasResume = Boolean(resume.data);
  const scoreBalance = usage.data?.resumeScore;
  const tailorBalance = usage.data?.resumeTailor;
  const scoreOut = scoreBalance ? !scoreBalance.allowed : false;
  const tailorOut = tailorBalance ? !tailorBalance.allowed : false;

  async function runScore() {
    if (!job) return;
    setError(undefined);
    setScoreResult(null);
    try {
      setScoreResult(await score.mutateAsync({ jobId: job.id }));
    } catch (e) {
      setError((e as Error).message || "Scoring failed. You may be out of scores this month.");
    }
  }

  async function runTailor() {
    if (!job) return;
    setError(undefined);
    setTailorResult(null);
    try {
      setTailorResult(await tailor.mutateAsync({ jobId: job.id }));
    } catch (e) {
      setError((e as Error).message || "Tailoring failed. You may be out of runs this month.");
    }
  }

  return (
    <AppShell
      title="Resume"
      subtitle="Score it against a real posting, then tailor the bullets you already have."
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href="/board">Browse jobs</Link>
        </Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <UploadCard />

          <section className="jl-card p-5 sm:p-6">
            <p className="eyebrow">AI tools</p>
            <h2 className="mt-1.5 text-lg font-semibold text-foreground">
              Match against a live posting
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Both tools read the real job description. They never invent experience you don't have.
            </p>

            {!hasResume ? (
              <EmptyState
                className="mt-5"
                title="Upload a resume first"
                body="The scorer and the tailoring tool both work from your uploaded PDF."
              />
            ) : (
              <>
                <div className="mt-5">
                  <JobPicker picked={job} onPick={setJob} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Button
                    onClick={() => void runScore()}
                    disabled={!job || score.isPending || scoreOut}
                  >
                    {score.isPending ? <Spinner /> : <Sparkles className="size-4" />}
                    {score.isPending ? "Scoring…" : "Score my match"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void runTailor()}
                    disabled={!job || tailor.isPending || tailorOut}
                  >
                    {tailor.isPending ? <Spinner /> : <Wand2 className="size-4" />}
                    {tailor.isPending ? "Tailoring…" : "Tailor my bullets"}
                  </Button>
                  {scoreOut || tailorOut ? (
                    <Button variant="ghost" asChild>
                      <Link href="/pricing">Out of runs — upgrade</Link>
                    </Button>
                  ) : null}
                </div>

                {error ? <ErrorNote className="mt-4" message={error} /> : null}

                {score.isPending ? (
                  <div className="mt-5 flex items-center gap-3 rounded-[14px] border border-border bg-muted/30 px-5 py-6">
                    <Spinner />
                    <p className="text-sm text-muted-foreground">
                      Reading the posting and grading your resume against it…
                    </p>
                  </div>
                ) : scoreResult ? (
                  <ScorePanel result={scoreResult} />
                ) : null}

                {tailor.isPending ? (
                  <div className="mt-5 flex items-center gap-3 rounded-[14px] border border-border bg-muted/30 px-5 py-6">
                    <Spinner />
                    <p className="text-sm text-muted-foreground">
                      Rewriting your real bullets in the posting's language…
                    </p>
                  </div>
                ) : tailorResult ? (
                  <TailorPanel result={tailorResult} />
                ) : null}
              </>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="jl-card p-5">
            <p className="eyebrow">This month</p>
            <dl className="mt-4 space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-muted-foreground">Match scores</dt>
                <dd className="text-sm font-semibold text-foreground">
                  {usage.isPending ? "…" : formatBalance(scoreBalance)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-sm text-muted-foreground">Tailoring runs</dt>
                <dd className="text-sm font-semibold text-foreground">
                  {usage.isPending ? "…" : formatBalance(tailorBalance)}
                </dd>
              </div>
            </dl>
            {scoreOut || tailorOut ? (
              <Button className="mt-4 w-full" size="sm" asChild>
                <Link href="/pricing">Upgrade for more</Link>
              </Button>
            ) : null}
          </section>

          <HistoryCard />
        </div>
      </div>
    </AppShell>
  );
}
