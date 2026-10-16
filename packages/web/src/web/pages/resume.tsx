import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  Check,
  ClipboardPaste,
  Copy,
  Download,
  FileText,
  History,
  Mail,
  NotebookPen,
  Search,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { AppShell } from "../components/app-shell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input, Label, Textarea } from "../components/ui/input";
import { EmptyState, ErrorNote, Skeleton, Spinner } from "../components/ui/feedback";
import { useJobs } from "../queries/jobs";
import {
  useCurrentResume,
  useDownloadResume,
  useExperienceBank,
  useExportCoverLetter,
  useExportResume,
  useExtractDocument,
  useResumeHistory,
  useSaveExperienceBank,
  useSaveTailor,
  useScoreResume,
  useTailorHistory,
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
  approved: number[];
  coverLetter: string;
};

type PastedJob = { company: string; title: string; description: string };

const DOCX_ACCEPT =
  ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
            One file powers every tool
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
            <ErrorNote message="We only read a little text from that file. If it's a PDF exported as an image, upload the Word (.docx) version instead." />
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
            {upload.isPending ? "Reading your resume…" : "Drop your resume here"}
          </span>
          <span className="text-xs text-muted-foreground">
            or click to browse · Word (.docx) or PDF, up to 8MB · .docx keeps your formatting
            on tailored downloads
          </span>
        </button>
      )}

      {error ? <ErrorNote className="mt-4" message={error} /> : null}

      <input
        ref={inputRef}
        type="file"
        aria-label="Upload resume"
        accept={`application/pdf,${DOCX_ACCEPT}`}
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
  const [approved, setApproved] = useState<number[]>(result.approved);
  const [letter, setLetter] = useState(result.coverLetter);
  const [copied, setCopied] = useState<"lines" | "letter" | null>(null);
  const [missed, setMissed] = useState<{ original: string; tailored: string }[]>([]);
  const [error, setError] = useState<string | undefined>();
  const save = useSaveTailor();
  const exportResume = useExportResume();
  const exportLetter = useExportCoverLetter();

  const approvedSet = useMemo(() => new Set(approved), [approved]);
  const dirty =
    letter !== result.coverLetter ||
    approved.length !== result.approved.length ||
    approved.some((i) => !result.approved.includes(i));

  function toggle(index: number) {
    setApproved((current) =>
      current.includes(index) ? current.filter((i) => i !== index) : [...current, index],
    );
  }

  async function copy(kind: "lines" | "letter") {
    const text =
      kind === "letter"
        ? letter
        : result.changes
            .filter((_, i) => approvedSet.has(i))
            .map((change) => `• ${change.tailored}`)
            .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 1800);
  }

  async function persist() {
    await save.mutateAsync({ id: result.id, approved, coverLetter: letter });
  }

  async function download(kind: "resume" | "letter") {
    setError(undefined);
    try {
      await persist();
      if (kind === "resume") setMissed(await exportResume.mutateAsync(result.id));
      else await exportLetter.mutateAsync(result.id);
    } catch (e) {
      setError((e as Error).message || "Download failed.");
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="rounded-[14px] border border-border bg-card p-5">
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void copy("lines")}>
              {copied === "lines" ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied === "lines" ? "Copied" : "Copy kept lines"}
            </Button>
            <Button
              size="sm"
              onClick={() => void download("resume")}
              disabled={exportResume.isPending || approved.length === 0}
            >
              {exportResume.isPending ? <Spinner /> : <Download className="size-4" />}
              Download resume
            </Button>
          </div>
        </div>

        {missed.length > 0 ? (
          <div className="mt-4 rounded-[12px] border border-amber/40 bg-amber/5 p-4">
            <p className="text-sm font-semibold text-foreground">
              {missed.length} line{missed.length === 1 ? "" : "s"} couldn't be placed automatically
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your downloaded resume has everything else. Paste these in by hand:
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {missed.map((m, i) => (
                <li key={i} className="text-xs leading-relaxed text-foreground">
                  • {m.tailored}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

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

      {result.coverLetter ? (
        <div className="rounded-[14px] border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Cover letter</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Drafted from your resume and experience notes. Edit it here — downloads use your
                version.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void copy("letter")}>
                {copied === "letter" ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === "letter" ? "Copied" : "Copy"}
              </Button>
              <Button
                size="sm"
                onClick={() => void download("letter")}
                disabled={exportLetter.isPending || !letter.trim()}
              >
                {exportLetter.isPending ? <Spinner /> : <Mail className="size-4" />}
                Download cover letter
              </Button>
            </div>
          </div>
          <Textarea
            aria-label="Cover letter"
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
            className="mt-4 min-h-[380px] text-[13.5px]"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {error ? <ErrorNote className="mr-auto" message={error} /> : null}
        <Button
          variant="outline"
          size="sm"
          onClick={() => void persist()}
          disabled={save.isPending || !dirty}
        >
          {save.isPending ? <Spinner /> : null}
          {dirty ? "Save changes" : "Saved"}
        </Button>
      </div>
    </div>
  );
}

/** Extra true facts — projects, courses, old cover letters — the AI may draw on. */
function ExperienceBankCard() {
  const bank = useExperienceBank();
  const saveBank = useSaveExperienceBank();
  const extract = useExtractDocument();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  const value = draft ?? bank.data?.content ?? "";
  const dirty = draft !== null && draft !== (bank.data?.content ?? "");

  async function importFile(file?: File | null) {
    if (!file) return;
    setError(undefined);
    try {
      const { text } = await extract.mutateAsync({ file });
      setDraft((value ? `${value.trimEnd()}\n\n` : "") + text);
    } catch (e) {
      setError((e as Error).message || "Couldn't read that file.");
    }
  }

  async function save() {
    setError(undefined);
    try {
      await saveBank.mutateAsync({ content: value });
      setDraft(null);
    } catch (e) {
      setError((e as Error).message || "Save failed.");
    }
  }

  return (
    <section className="jl-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Experience notes</p>
          <h2 className="mt-1.5 text-lg font-semibold text-foreground">
            Everything that didn't fit on one page
          </h2>
          <p className="mt-1 max-w-[52ch] text-sm text-muted-foreground">
            Projects, coursework, certifications, old cover-letter paragraphs. Tailoring and
            cover letters pull from these alongside your resume — only add what's true.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={extract.isPending}
        >
          {extract.isPending ? <Spinner /> : <NotebookPen className="size-4" />}
          Import a document
        </Button>
      </div>

      {bank.isPending ? (
        <Skeleton className="mt-5 h-[160px] w-full" />
      ) : (
        <Textarea
          aria-label="Experience notes"
          value={value}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Built a top-down tank game in Pygame using trigonometry and matrix math for movement…"
          className="mt-5 min-h-[160px] text-[13px]"
        />
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {value.length.toLocaleString()} / 30,000 characters
        </p>
        <Button size="sm" onClick={() => void save()} disabled={!dirty || saveBank.isPending}>
          {saveBank.isPending ? <Spinner /> : null}
          {dirty ? "Save notes" : "Saved"}
        </Button>
      </div>

      {error ? <ErrorNote className="mt-4" message={error} /> : null}

      <input
        ref={inputRef}
        type="file"
        aria-label="Import experience document"
        accept={`application/pdf,${DOCX_ACCEPT}`}
        className="hidden"
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </section>
  );
}

function PasteJobForm({ value, onChange }: { value: PastedJob; onChange: (v: PastedJob) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="paste-company">Company</Label>
          <Input
            id="paste-company"
            value={value.company}
            onChange={(e) => onChange({ ...value, company: e.target.value })}
            placeholder="Corteva"
          />
        </div>
        <div>
          <Label htmlFor="paste-title">Role</Label>
          <Input
            id="paste-title"
            value={value.title}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            placeholder="Data Science Intern"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="paste-description">Job description</Label>
        <Textarea
          id="paste-description"
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          placeholder="Paste the full posting — responsibilities, qualifications, nice-to-haves."
          className="min-h-[160px] text-[13px]"
        />
      </div>
    </div>
  );
}

function TailorHistoryCard({ onOpen }: { onOpen: (run: TailorResult) => void }) {
  const history = useTailorHistory();

  return (
    <section className="jl-card p-5">
      <p className="eyebrow">Tailored applications</p>
      {history.isPending ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (history.data?.length ?? 0) === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Each job you tailor for lands here, so you can re-download its resume and letter.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {history.data!.map((run) => (
            <li key={run.id}>
              <button
                type="button"
                onClick={() => onOpen(run)}
                className="flex w-full items-center gap-3 rounded-[11px] border border-border px-3 py-2.5 text-left transition hover:bg-muted"
              >
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-[9px] text-[11px] font-bold text-white"
                  style={{ backgroundColor: markColor(run.companyName) }}
                >
                  {initials(run.companyName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {run.jobTitle}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {run.companyName} · {shortDate(run.createdAt)}
                  </span>
                </span>
                <History className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
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

  const search = useSearch();
  const [mode, setMode] = useState<"board" | "paste">("board");
  const [job, setJob] = useState<PickedJob | null>(null);
  const [pasted, setPasted] = useState<PastedJob>({ company: "", title: "", description: "" });
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [tailorResult, setTailorResult] = useState<TailorResult | null>(null);
  const [error, setError] = useState<string | undefined>();

  const hasResume = Boolean(resume.data);
  const scoreBalance = usage.data?.resumeScore;
  const tailorBalance = usage.data?.resumeTailor;
  const scoreOut = scoreBalance ? !scoreBalance.allowed : false;
  const tailorOut = tailorBalance ? !tailorBalance.allowed : false;

  // Deep links from the board and tracker: ?jobId=&title=&company=
  useEffect(() => {
    const params = new URLSearchParams(search);
    const jobId = Number(params.get("jobId"));
    const title = params.get("title") ?? "";
    const company = params.get("company") ?? "";
    if (jobId > 0) {
      setMode("board");
      setJob({ id: jobId, title: title || "Selected posting", companyName: company || "—" });
    } else if (title || company) {
      setMode("paste");
      setPasted((p) => ({ ...p, title, company }));
    }
  }, [search]);

  const target =
    mode === "board"
      ? job
        ? { jobId: job.id }
        : null
      : pasted.company.trim() && pasted.title.trim() && pasted.description.trim().length >= 80
        ? { custom: pasted }
        : null;

  async function runScore() {
    if (!target) return;
    setError(undefined);
    setScoreResult(null);
    try {
      setScoreResult(await score.mutateAsync(target));
    } catch (e) {
      setError((e as Error).message || "Scoring failed. You may be out of scores this month.");
    }
  }

  async function runTailor() {
    if (!target) return;
    setError(undefined);
    setTailorResult(null);
    try {
      setTailorResult(await tailor.mutateAsync(target));
    } catch (e) {
      setError((e as Error).message || "Tailoring failed. You may be out of runs this month.");
    }
  }

  return (
    <AppShell
      title="Resume"
      subtitle="Tailor your resume and cover letter to every job you apply to."
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href="/board">Browse jobs</Link>
        </Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <UploadCard />
          <ExperienceBankCard />

          <section className="jl-card p-5 sm:p-6">
            <p className="eyebrow">AI tools</p>
            <h2 className="mt-1.5 text-lg font-semibold text-foreground">
              Tailor for one job
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a posting from the board or paste one from anywhere. You get rewritten bullets
              to approve, a matching cover letter, and Word downloads of both.
            </p>

            {!hasResume ? (
              <EmptyState
                className="mt-5"
                title="Upload a resume first"
                body="The scorer and the tailoring tool both work from your uploaded resume."
              />
            ) : (
              <>
                <div className="mt-5 inline-flex rounded-[10px] border border-border bg-muted/40 p-1">
                  {(
                    [
                      { id: "board", label: "From the board", icon: Search },
                      { id: "paste", label: "Paste a posting", icon: ClipboardPaste },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setMode(tab.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition",
                        mode === tab.id
                          ? "bg-card text-foreground shadow-[0_1px_2px_rgba(16,32,64,0.12)]"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <tab.icon className="size-3.5" />
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4">
                  {mode === "board" ? (
                    <JobPicker picked={job} onPick={setJob} />
                  ) : (
                    <PasteJobForm value={pasted} onChange={setPasted} />
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Button
                    onClick={() => void runScore()}
                    disabled={!target || score.isPending || scoreOut}
                  >
                    {score.isPending ? <Spinner /> : <Sparkles className="size-4" />}
                    {score.isPending ? "Scoring…" : "Score my match"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void runTailor()}
                    disabled={!target || tailor.isPending || tailorOut}
                  >
                    {tailor.isPending ? <Spinner /> : <Wand2 className="size-4" />}
                    {tailor.isPending ? "Tailoring…" : "Tailor resume + cover letter"}
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
                      Rewriting your real bullets and drafting a cover letter…
                    </p>
                  </div>
                ) : tailorResult ? (
                  <TailorPanel key={tailorResult.id} result={tailorResult} />
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

          <TailorHistoryCard
            onOpen={(run) => {
              setTailorResult(run);
              setScoreResult(null);
            }}
          />
          <HistoryCard />
        </div>
      </div>
    </AppShell>
  );
}
