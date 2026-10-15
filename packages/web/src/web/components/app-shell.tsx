import { useState } from "react";
import { Link, useLocation } from "wouter";
import { FileText, KanbanSquare, LayoutGrid, LogOut, Menu, Sparkles, X } from "lucide-react";
import { authClient } from "../lib/auth";
import { useUsage, formatBalance } from "../queries/billing";
import { Lockmark } from "./lockmark";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/board", label: "Job board", icon: LayoutGrid },
  { href: "/tracker", label: "Tracker", icon: KanbanSquare },
  { href: "/resume", label: "Resume tools", icon: FileText },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const active = location === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            to={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition",
              active
                ? "bg-primary text-primary-foreground shadow-[0_2px_10px_-2px_rgba(29,78,216,0.7)]"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UsageCard() {
  const usage = useUsage();
  const { data } = usage;

  const plan = data?.trackerSlots?.unlimited ? "Paid plan" : "Free plan";

  return (
    <div className="rounded-[12px] border border-sidebar-border bg-sidebar-accent/60 p-3">
      <p className="eyebrow text-sidebar-foreground/70">This month</p>
      {usage.isLoading ? (
        <div className="mt-2 space-y-2">
          <div className="h-3 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
        </div>
      ) : (
        <dl className="mt-2 space-y-1.5 text-[12.5px]">
          <div className="flex justify-between gap-2">
            <dt className="text-sidebar-foreground/80">Scores</dt>
            <dd className="font-medium text-white">{formatBalance(data?.resumeScore)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-sidebar-foreground/80">Tailors</dt>
            <dd className="font-medium text-white">{formatBalance(data?.resumeTailor)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-sidebar-foreground/80">Slots</dt>
            <dd className="font-medium text-white">{formatBalance(data?.trackerSlots)}</dd>
          </div>
        </dl>
      )}
      <Link
        to="/pricing"
        className="mt-3 flex items-center justify-center gap-1.5 rounded-[9px] bg-white/10 px-3 py-2 text-[12.5px] font-semibold text-white transition hover:bg-white/18"
      >
        <Sparkles className="size-3.5" />
        {plan === "Free plan" ? "Upgrade plan" : "Manage plan"}
      </Link>
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { data: session } = authClient.useSession();

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link to="/" className="flex items-center gap-2 px-1 py-1" onClick={onNavigate}>
        <Lockmark className="size-7 text-white" />
        <span className="text-[15px] font-bold tracking-tight text-white">Job Lock</span>
      </Link>

      <div className="flex-1 space-y-6">
        <div>
          <p className="eyebrow mb-2 px-3 text-sidebar-foreground/55">Workspace</p>
          <NavLinks onNavigate={onNavigate} />
        </div>
        <UsageCard />
      </div>

      <div className="border-t border-sidebar-border pt-3">
        <div className="flex items-center gap-2.5 px-1 pb-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-white">
            {(session?.user?.name || session?.user?.email || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-white">
              {session?.user?.name || "Signed in"}
            </p>
            <p className="truncate text-[11.5px] text-sidebar-foreground/70">
              {session?.user?.email}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            void authClient.signOut().then(() => {
              window.location.href = "/";
            });
          }}
          className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-medium text-sidebar-foreground transition hover:bg-sidebar-accent hover:text-white"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] bg-sidebar lg:block">
        <SidebarBody />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-ink/50"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[264px] bg-sidebar">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1 text-sidebar-foreground hover:text-white"
            >
              <X className="size-5" />
            </button>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
          <div className="flex items-center gap-3 px-4 py-3.5 sm:px-6">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setOpen(true)}
              className="rounded-md p-1.5 text-foreground transition hover:bg-muted lg:hidden"
            >
              <Menu className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[17px] font-semibold text-foreground">{title}</h1>
              {subtitle ? (
                <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
