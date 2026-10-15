import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { authClient } from "../lib/auth";
import { Button } from "./ui/button";
import { Lockmark } from "./lockmark";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/board", label: "Job board" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#features", label: "How it works" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader({ variant = "onLight" }: { variant?: "onLight" | "onSky" }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { data: session } = authClient.useSession();
  const [location] = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const transparent = variant === "onSky" && !scrolled;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-colors duration-200",
        transparent
          ? "bg-transparent"
          : "border-b border-border/80 bg-background/85 backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3.5">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <Lockmark className="size-7 text-primary" />
          <span className="text-[16px] font-bold tracking-tight text-ink">Job Lock</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={cn(
                "rounded-md px-3 py-2 text-[14px] font-medium text-foreground/75 transition hover:bg-white/60 hover:text-ink",
                location === link.href && "text-ink",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          {session ? (
            <Button asChild className="rounded-[10px] font-semibold">
              <Link to="/board">Open app</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="rounded-[10px] font-semibold">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button asChild className="rounded-[10px] font-semibold">
                <Link to="/auth?mode=signup">Start free</Link>
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label="Menu"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto rounded-md p-1.5 text-ink transition hover:bg-white/60 md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-border bg-background px-5 py-3 md:hidden">
          <div className="flex flex-col">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2.5 text-[15px] font-medium text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-2">
              {session ? (
                <Button asChild className="flex-1 rounded-[10px]">
                  <Link to="/board">Open app</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline" className="flex-1 rounded-[10px]">
                    <Link to="/auth">Sign in</Link>
                  </Button>
                  <Button asChild className="flex-1 rounded-[10px]">
                    <Link to="/auth?mode=signup">Start free</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-ink">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2">
              <Lockmark className="size-7 text-white" />
              <span className="text-[16px] font-bold tracking-tight text-white">Job Lock</span>
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-white/60">
              Lock in and apply. Curated new-grad and junior software roles, pulled straight from
              company job boards.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            <div>
              <p className="eyebrow text-white/45">Product</p>
              <ul className="mt-3 space-y-2 text-[13.5px] text-white/70">
                <li>
                  <Link to="/board" className="transition hover:text-white">
                    Job board
                  </Link>
                </li>
                <li>
                  <Link to="/tracker" className="transition hover:text-white">
                    Tracker
                  </Link>
                </li>
                <li>
                  <Link to="/resume" className="transition hover:text-white">
                    Resume tools
                  </Link>
                </li>
                <li>
                  <Link to="/pricing" className="transition hover:text-white">
                    Pricing
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="eyebrow text-white/45">Get started</p>
              <ul className="mt-3 space-y-2 text-[13.5px] text-white/70">
                <li>
                  <Link to="/auth?mode=signup" className="transition hover:text-white">
                    Create account
                  </Link>
                </li>
                <li>
                  <Link to="/auth" className="transition hover:text-white">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link to="/#faq" className="transition hover:text-white">
                    FAQ
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-10 border-t border-white/10 pt-6 text-[12.5px] text-white/45">
          © {new Date().getFullYear()} Job Lock. Job data belongs to the companies posting it.
        </p>
      </div>
    </footer>
  );
}
