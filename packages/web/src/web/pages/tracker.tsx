import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ExternalLink, Flame, Plus, Sparkles, Trash2, TrendingUp } from "lucide-react";
import { AppShell } from "../components/app-shell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Input, Label, Select, Textarea } from "../components/ui/input";
import { EmptyState, ErrorNote, Skeleton, Spinner } from "../components/ui/feedback";
import {
  useApplications,
  useApplicationStats,
  useCreateManualApplication,
  useRemoveApplication,
  useUpdateApplicationStatus,
  type AppStatus,
} from "../queries/applications";
import { useUsage } from "../queries/billing";
import { initials, levelLabel, markColor, shortDate } from "../lib/format";
import { cn } from "@/lib/utils";

const COLUMNS: { id: AppStatus; label: string; tone: string }[] = [
  { id: "saved", label: "Saved", tone: "#6FA8F0" },
  { id: "applied", label: "Applied", tone: "#1D4ED8" },
  { id: "interviewing", label: "Interviewing", tone: "#D9820A" },
  { id: "offer", label: "Offer", tone: "#0F9D76" },
  { id: "rejected", label: "Rejected", tone: "#D63B3B" },
];

type Row = {
  id: number;
  status: string;
  title: string;
  company: string;
  url: string | null;
  logo: string | null;
  appliedAt: Date | string | null;
  createdAt: Date | string;
  jobLevel: string | null;
  jobLocation: string | null;
  notes: string | null;
};

function Card({
  row,
  tone,
  onRemove,
  removing,
  dragging,
}: {
  row: Row;
  tone: string;
  onRemove?: () => void;
  removing?: boolean;
  dragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "group rounded-[10px] border border-border bg-card p-3 shadow-[0_1px_2px_rgba(16,32,64,0.06)]",
        dragging && "rotate-1 shadow-[0_16px_36px_-16px_rgba(11,18,32,0.45)]",
      )}
      style={{ borderLeft: `3px solid ${tone}` }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-[10.5px] font-bold text-white"
          style={{ background: markColor(row.company) }}
        >
          {initials(row.company)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-snug text-ink">{row.title}</p>
          <p className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {row.company}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {row.jobLevel ? <Badge tone="blue">{levelLabel(row.jobLevel)}</Badge> : null}
        <Badge tone="gray">
          {row.appliedAt ? `applied ${shortDate(row.appliedAt)}` : `saved ${shortDate(row.createdAt)}`}
        </Badge>
      </div>

      <div className="mt-2.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
        {row.url ? (
          <a
            href={row.url}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-[7px] px-1.5 py-1 text-[11.5px] font-semibold text-primary transition hover:bg-accent"
          >
            Open <ExternalLink className="size-3" />
          </a>
        ) : null}
        {onRemove ? (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onRemove}
            disabled={removing}
            aria-label="Remove application"
            className="ml-auto rounded-[7px] p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
          >
            {removing ? <Spinner className="size-3" /> : <Trash2 className="size-3.5" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DraggableCard({
  row,
  tone,
  onRemove,
  removing,
}: {
  row: Row;
  tone: string;
  onRemove: () => void;
  removing: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("cursor-grab touch-none active:cursor-grabbing", isDragging && "opacity-35")}
    >
      <Card row={row} tone={tone} onRemove={onRemove} removing={removing} />
    </div>
  );
}

function Column({
  column,
  rows,
  onRemove,
  removingId,
}: {
  column: (typeof COLUMNS)[number];
  rows: Row[];
  onRemove: (id: number) => void;
  removingId: number | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="flex min-w-[248px] flex-1 flex-col">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span className="size-2 rounded-full" style={{ background: column.tone }} />
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
          {column.label}
        </p>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-muted-foreground">
          {rows.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "jl-scroll flex-1 space-y-2.5 rounded-[12px] border border-dashed border-transparent bg-white/55 p-2.5 transition",
          "min-h-[180px]",
          isOver && "border-primary/50 bg-accent/60",
        )}
      >
        {rows.map((row) => (
          <DraggableCard
            key={row.id}
            row={row}
            tone={column.tone}
            onRemove={() => onRemove(row.id)}
            removing={removingId === row.id}
          />
        ))}
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12.5px] leading-relaxed text-muted-foreground/70">
            {column.id === "saved"
              ? "Track a job from the board and it lands here."
              : "Drag cards across as things move."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateManualApplication();
  const [form, setForm] = useState({
    company: "",
    title: "",
    url: "",
    status: "saved" as AppStatus,
    notes: "",
  });
  const [error, setError] = useState<string | undefined>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    try {
      await create.mutateAsync({
        company: form.company.trim(),
        title: form.title.trim(),
        url: form.url.trim() || undefined,
        status: form.status,
        notes: form.notes.trim() || undefined,
      });
      setForm({ company: "", title: "", url: "", status: "saved", notes: "" });
      onClose();
    } catch (err) {
      setError(
        (err as Error).message ||
          "Couldn't add that. You may have hit your tracker slot limit on the free plan.",
      );
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add an application"
      description="For roles you found somewhere other than the board."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="company">Company</Label>
            <Input
              id="company"
              required
              maxLength={120}
              placeholder="Stripe"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="title">Role</Label>
            <Input
              id="title"
              required
              maxLength={160}
              placeholder="New Grad Software Engineer"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="url">Posting link (optional)</Label>
          <Input
            id="url"
            type="url"
            placeholder="https://…"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="status">Column</Label>
          <Select
            id="status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as AppStatus })}
          >
            {COLUMNS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            maxLength={2000}
            placeholder="Referral from Sam, recruiter screen booked for Tuesday…"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <ErrorNote message={error} />

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1 rounded-[10px]">
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={create.isPending}
            className="flex-1 rounded-[10px] font-semibold"
          >
            {create.isPending ? <Spinner /> : null}
            Add application
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default function TrackerPage() {
  const applications = useApplications();
  const stats = useApplicationStats();
  const usage = useUsage();
  const updateStatus = useUpdateApplicationStatus();
  const remove = useRemoveApplication();

  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const rows = useMemo(
    () => (applications.data ?? []) as unknown as Row[],
    [applications.data],
  );

  const grouped = useMemo(() => {
    const map: Record<string, Row[]> = {};
    for (const column of COLUMNS) map[column.id] = [];
    for (const row of rows) (map[row.status] ??= []).push(row);
    return map;
  }, [rows]);

  const dragRow = rows.find((r) => r.id === dragId) ?? null;

  function onDragStart(event: DragStartEvent) {
    setDragId(Number(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setDragId(null);
    const overId = event.over?.id;
    if (!overId) return;
    const id = Number(event.active.id);
    const status = String(overId) as AppStatus;
    const row = rows.find((r) => r.id === id);
    if (!row || row.status === status) return;
    updateStatus.mutate({ id, status });
  }

  const slotsUsed = rows.length;
  const slotLimit = stats.data?.slotLimit ?? null;
  const slotsUnlimited = stats.data?.slotsUnlimited ?? false;
  const nearLimit =
    !slotsUnlimited && slotLimit !== null && slotLimit > 0 && slotsUsed >= slotLimit * 0.8;

  return (
    <AppShell
      title="Application tracker"
      subtitle={
        slotsUnlimited
          ? `${slotsUsed} applications tracked`
          : `${slotsUsed}${slotLimit ? ` of ${slotLimit}` : ""} slots used`
      }
      actions={
        <Button onClick={() => setAdding(true)} className="rounded-[10px] font-semibold">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Add application</span>
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              k: "Applied this week",
              v: stats.data?.appliedThisWeek ?? 0,
              icon: TrendingUp,
              tone: "text-primary",
            },
            {
              k: "Day streak",
              v: stats.data?.streak ?? 0,
              icon: Flame,
              tone: "text-amber",
            },
            {
              k: "Response rate",
              v: `${stats.data?.responseRate ?? 0}%`,
              icon: Sparkles,
              tone: "text-mint",
            },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.k} className="jl-card flex items-center gap-3.5 p-4">
                <div className={cn("flex size-10 items-center justify-center rounded-[10px] bg-muted", s.tone)}>
                  <Icon className="size-[18px]" />
                </div>
                <div>
                  <p className="eyebrow text-muted-foreground">{s.k}</p>
                  {stats.isLoading ? (
                    <Skeleton className="mt-1 h-6 w-12" />
                  ) : (
                    <p className="text-[22px] font-bold leading-tight text-ink">{s.v}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {nearLimit ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-amber/30 bg-amber/8 px-4 py-3">
            <Sparkles className="size-4 shrink-0 text-amber" />
            <p className="flex-1 text-[13.5px] text-foreground">
              {usage.data?.trackerSlots.remaining ?? 0} tracker slots left on the free plan. Pro
              lifts the cap entirely.
            </p>
            <Button asChild size="sm" className="rounded-[9px] font-semibold">
              <Link to="/pricing">See plans</Link>
            </Button>
          </div>
        ) : null}

        {/* Board */}
        {applications.isLoading ? (
          <div className="grid gap-3 lg:grid-cols-5">
            {COLUMNS.map((c) => (
              <Skeleton key={c.id} className="h-64" />
            ))}
          </div>
        ) : applications.isError ? (
          <ErrorNote message="Couldn't load your tracker. Refresh to try again." />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nothing tracked yet"
            body="Track a role from the job board and it shows up in Saved, or add one you found elsewhere by hand."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild className="rounded-[10px] font-semibold">
                  <Link to="/board">Browse the board</Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setAdding(true)}
                  className="rounded-[10px] font-semibold"
                >
                  Add manually
                </Button>
              </div>
            }
          />
        ) : (
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="jl-scroll flex gap-3 overflow-x-auto pb-3">
              {COLUMNS.map((column) => (
                <Column
                  key={column.id}
                  column={column}
                  rows={grouped[column.id] ?? []}
                  onRemove={(id) => remove.mutate({ id })}
                  removingId={remove.isPending ? (remove.variables?.id ?? null) : null}
                />
              ))}
            </div>

            <DragOverlay>
              {dragRow ? (
                <Card
                  row={dragRow}
                  tone={COLUMNS.find((c) => c.id === dragRow.status)?.tone ?? "#6FA8F0"}
                  dragging
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      <AddDialog open={adding} onClose={() => setAdding(false)} />
    </AppShell>
  );
}
