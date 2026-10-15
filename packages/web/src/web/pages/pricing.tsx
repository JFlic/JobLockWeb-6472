import { Fragment, useMemo, useState } from "react";
import { Link } from "wouter";
import { useCustomer, useListPlans } from "autumn-js/react";
import { ArrowRight, Check, ChevronDown, Minus, Sparkles } from "lucide-react";
import { authClient } from "../lib/auth";
import { SiteFooter, SiteHeader } from "../components/site-chrome";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Spinner } from "../components/ui/feedback";
import { useJobStats } from "../queries/jobs";
import { cn } from "@/lib/utils";

type Cycle = "monthly" | "annual";

const TIERS = [
  {
    key: "free",
    name: "Free",
    tagline: "Run a real search and see if it sticks.",
    monthlyId: "free",
    annualId: "free",
    priceMonthly: 0,
    priceAnnual: 0,
    features: [
      "Unlimited job board browsing",
      "50 tracker slots",
      "3 AI resume scores a month",
      "1 AI tailoring run a month",
    ],
    cta: "Start free",
  },
  {
    key: "pro",
    name: "Pro",
    tagline: "For the month you're applying every day.",
    monthlyId: "pro",
    annualId: "pro_annual",
    priceMonthly: 9.99,
    priceAnnual: 59,
    popular: true,
    features: [
      "Unlimited tracker slots",
      "30 AI resume scores a month",
      "15 AI tailoring runs a month",
      "Weekly digest of new roles",
      "Everything in Free",
    ],
    cta: "Go Pro",
  },
  {
    key: "premium",
    name: "Premium",
    tagline: "Full-time search, every role tailored.",
    monthlyId: "premium",
    annualId: "premium_annual",
    priceMonthly: 19.99,
    priceAnnual: 119,
    features: [
      "Unlimited tracker slots",
      "100 AI resume scores a month",
      "50 AI tailoring runs a month",
      "Weekly digest of new roles",
      "Everything in Pro",
    ],
    cta: "Go Premium",
  },
] as const;

const COMPARISON: { section: string; rows: [string, string, string, string][] }[] = [
  {
    section: "Job board",
    rows: [
      ["Browse every open role", "yes", "yes", "yes"],
      ["Level, location, remote, visa filters", "yes", "yes", "yes"],
      ["Apply on the company's own site", "yes", "yes", "yes"],
      ["Weekly digest of new matches", "no", "yes", "yes"],
    ],
  },
  {
    section: "Application tracker",
    rows: [
      ["Kanban board with drag and drop", "yes", "yes", "yes"],
      ["Tracked applications", "50", "Unlimited", "Unlimited"],
      ["Manual entries for roles found elsewhere", "yes", "yes", "yes"],
      ["Streak, volume and response rate", "yes", "yes", "yes"],
    ],
  },
  {
    section: "AI resume tools",
    rows: [
      ["Resume upload and text extraction", "yes", "yes", "yes"],
      ["Match scores per month", "3", "30", "100"],
      ["Tailoring runs per month", "1", "15", "50"],
      ["Missing-keyword analysis", "yes", "yes", "yes"],
      ["Side-by-side approve before applying changes", "yes", "yes", "yes"],
      ["Never invents experience", "yes", "yes", "yes"],
    ],
  },
];

const FAQ = [
  {
    q: "Can I switch plans later?",
    a: "Any time. Upgrades apply immediately and the new allowances are available the moment checkout finishes. Downgrades take effect at the end of the current period.",
  },
  {
    q: "What happens when I run out of scores?",
    a: "The board and tracker keep working — only the AI actions pause. You'll see exactly what's blocked and how many are left before you hit the wall.",
  },
  {
    q: "Is annual actually cheaper?",
    a: "Pro is $59 a year against $119.88 monthly, and Premium is $119 against $239.88. Both are roughly five months free.",
  },
  {
    q: "Do unused scores roll over?",
    a: "No — allowances reset each billing period. Pick the tier that matches how hard you're searching this month, not next year.",
  },
];

function Cell({ value }: { value: string }) {
  if (value === "yes")
    return (
      <span className="inline-flex items-center justify-center">
        <Check className="size-4 text-mint" />
      </span>
    );
  if (value === "no")
    return (
      <span className="inline-flex items-center justify-center">
        <Minus className="size-4 text-muted-foreground/40" />
      </span>
    );
  return <span className="text-[13.5px] font-semibold text-foreground">{value}</span>;
}

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

export default function PricingPage() {
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  const { data: session } = authClient.useSession();
  const { data: customer, attach } = useCustomer();
  useListPlans();
  const stats = useJobStats();

  const activePlan = useMemo(() => {
    const sub = customer?.subscriptions?.find((s) => s.status === "active" || s.status === "trialing");
    return sub?.planId ?? (session ? "free" : null);
  }, [customer, session]);

  async function choose(tier: (typeof TIERS)[number]) {
    const planId = cycle === "annual" ? tier.annualId : tier.monthlyId;
    if (!session) {
      window.location.href = `/auth?mode=signup&plan=${planId}`;
      return;
    }
    setError(undefined);
    setPendingPlan(planId);
    try {
      await attach({ planId, successUrl: `${window.location.origin}/board` });
    } catch {
      setError("Couldn't open checkout. Try again in a moment.");
    } finally {
      setPendingPlan(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="hero-sky pb-24">
        <SiteHeader variant="onSky" />

        <section className="mx-auto max-w-6xl px-5 pt-12 text-center">
          <p className="eyebrow text-navy/60">Pricing</p>
          <h1 className="mx-auto mt-3 max-w-2xl text-[clamp(2.25rem,5.5vw,3.5rem)] font-bold leading-[1.04] tracking-[-0.03em] text-ink">
            Free until the search gets serious
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[16.5px] leading-relaxed text-navy/80">
            The board and the tracker are free. You pay only when you want the AI running on every
            application instead of a few.
          </p>

          <div className="mt-8 inline-flex items-center rounded-full bg-ink/8 p-1 backdrop-blur">
            {(["monthly", "annual"] as Cycle[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCycle(c)}
                className={cn(
                  "rounded-full px-5 py-2 text-[13.5px] font-semibold transition",
                  cycle === c ? "bg-white text-ink shadow-sm" : "text-navy/70 hover:text-ink",
                )}
              >
                {c === "monthly" ? "Monthly" : "Annual"}
                {c === "annual" ? (
                  <span className="ml-2 rounded-full bg-mint/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-mint">
                    save 50%
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {error ? (
            <p className="mx-auto mt-4 max-w-md rounded-[10px] bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {error}
            </p>
          ) : null}

          <div className="mt-12 grid gap-5 text-left lg:grid-cols-3">
            {TIERS.map((tier) => {
              const planId = cycle === "annual" ? tier.annualId : tier.monthlyId;
              const price = cycle === "annual" ? tier.priceAnnual : tier.priceMonthly;
              const isActive = activePlan === planId;
              const popular = "popular" in tier && tier.popular;

              return (
                <div
                  key={tier.key}
                  className={cn(
                    "jl-card relative flex flex-col p-6",
                    popular
                      ? "ring-2 ring-primary shadow-[0_24px_60px_-30px_rgba(29,78,216,0.55)] lg:-mt-3 lg:mb-3"
                      : "",
                  )}
                >
                  {popular ? (
                    <Badge
                      tone="solid"
                      className="absolute -top-3 left-6 shadow-[0_4px_12px_-4px_rgba(29,78,216,0.7)]"
                    >
                      <Sparkles className="size-3" />
                      Most popular
                    </Badge>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <h2 className="text-[20px] font-bold tracking-[-0.02em] text-ink">{tier.name}</h2>
                    {isActive ? <Badge tone="mint">Current</Badge> : null}
                  </div>
                  <p className="mt-1.5 text-[13.5px] leading-snug text-muted-foreground">
                    {tier.tagline}
                  </p>

                  <div className="mt-6 flex items-end gap-1.5">
                    <span className="text-[42px] font-bold leading-none tracking-[-0.03em] text-ink">
                      ${price}
                    </span>
                    <span className="pb-1 text-[13.5px] text-muted-foreground">
                      {price === 0 ? "forever" : cycle === "annual" ? "/year" : "/month"}
                    </span>
                  </div>
                  {cycle === "annual" && price > 0 ? (
                    <p className="mt-1 font-mono text-[10.5px] uppercase tracking-wider text-mint">
                      ${(price / 12).toFixed(2)}/mo billed yearly
                    </p>
                  ) : (
                    <p className="mt-1 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                      {price === 0 ? "no card required" : "cancel any time"}
                    </p>
                  )}

                  <Button
                    onClick={() => void choose(tier)}
                    disabled={isActive || pendingPlan !== null}
                    variant={popular ? "default" : "outline"}
                    className="mt-6 h-11 w-full rounded-[10px] text-[14.5px] font-semibold"
                  >
                    {pendingPlan === planId ? <Spinner /> : null}
                    {isActive ? "Your plan" : tier.cta}
                  </Button>

                  <ul className="mt-6 space-y-2.5 border-t border-border pt-5">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[14px] text-foreground">
                        <Check className="mt-0.5 size-4 shrink-0 text-mint" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Stats band */}
      <section className="border-y border-border bg-ink py-12">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 sm:grid-cols-3">
          {[
            { k: `${stats.data?.openJobs ?? 0}`, l: "roles on the board today" },
            { k: `${stats.data?.companies ?? 0}`, l: "companies synced from their ATS" },
            { k: "$0", l: "to browse, track and apply" },
          ].map((s) => (
            <div key={s.l}>
              <p className="text-[34px] font-bold leading-none tracking-[-0.03em] text-white">
                {s.k}
              </p>
              <p className="mt-2 text-[13.5px] text-white/60">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="mx-auto max-w-5xl px-5 py-20">
        <div className="text-center">
          <p className="eyebrow text-primary">Compare</p>
          <h2 className="mt-3 text-[clamp(1.85rem,4vw,2.5rem)] font-bold tracking-[-0.025em] text-ink">
            Everything, line by line
          </h2>
        </div>

        <div className="jl-scroll mt-10 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr>
                <th className="w-[46%] pb-3 text-left">
                  <span className="sr-only">Feature</span>
                </th>
                {TIERS.map((t) => (
                  <th key={t.key} className="pb-3 text-center">
                    <span
                      className={cn(
                        "text-[14.5px] font-bold tracking-tight",
                        "popular" in t && t.popular ? "text-primary" : "text-ink",
                      )}
                    >
                      {t.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((group) => (
                <Fragment key={group.section}>
                  <tr aria-label={group.section}>
                    <th colSpan={4} scope="colgroup" className="pt-6 text-left">
                      <span className="eyebrow block border-b border-border pb-2 text-muted-foreground">
                        {group.section}
                      </span>
                    </th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row[0]} className="border-b border-border/70">
                      <td className="py-3 pr-4 text-[14px] text-foreground">{row[0]}</td>
                      <td className="py-3 text-center">
                        <Cell value={row[1]} />
                      </td>
                      <td className="bg-accent/35 py-3 text-center">
                        <Cell value={row[2]} />
                      </td>
                      <td className="py-3 text-center">
                        <Cell value={row[3]} />
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 pb-20">
        <div className="text-center">
          <p className="eyebrow text-primary">FAQ</p>
          <h2 className="mt-3 text-[clamp(1.75rem,3.5vw,2.25rem)] font-bold tracking-[-0.025em] text-ink">
            Before you pay
          </h2>
        </div>
        <div className="mt-8 space-y-3">
          {FAQ.map((item) => (
            <FaqItem key={item.q} {...item} />
          ))}
        </div>
      </section>

      <section className="px-5 pb-20">
        <div className="mx-auto max-w-4xl rounded-[20px] bg-primary px-6 py-12 text-center sm:px-12">
          <h2 className="text-[clamp(1.6rem,3.5vw,2.15rem)] font-bold leading-tight tracking-[-0.025em] text-white">
            Start on Free. Upgrade when you're applying daily.
          </h2>
          <Button
            asChild
            size="lg"
            className="mt-6 h-12 rounded-[10px] bg-white px-8 text-[15px] font-semibold text-primary hover:bg-white/90"
          >
            <Link to={session ? "/board" : "/auth?mode=signup"}>
              {session ? "Open the board" : "Create free account"}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
