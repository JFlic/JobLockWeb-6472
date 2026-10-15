import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "wouter";
import { ArrowLeft, Check } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { authClient } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input, Label } from "../components/ui/input";
import { ErrorNote, Spinner } from "../components/ui/feedback";
import { Lockmark } from "../components/lockmark";
import { useJobStats } from "../queries/jobs";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";

export default function AuthPage() {
  const [params] = useSearchParams();
  const [, navigate] = useLocation();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const stats = useJobStats();

  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState<"email" | "google" | null>(null);

  useEffect(() => {
    if (!sessionPending && session) navigate("/board");
  }, [session, sessionPending, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy("email");
    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({ name: name.trim() || email.split("@")[0]!, email, password })
          : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "That didn't work. Check your details and try again.");
        return;
      }
      navigate("/board");
    } catch {
      setError("Something went wrong. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function google() {
    setError(undefined);
    setBusy("google");
    try {
      await authClient.managedAuth.signIn({ provider: "google" });
    } catch {
      setError("Google sign-in failed to start. Try email instead.");
      setBusy(null);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_46%]">
      {/* Form */}
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Lockmark className="size-7 text-primary" />
            <span className="text-[16px] font-bold tracking-tight text-ink">Job Lock</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Home
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.025em] text-ink">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-[14.5px] text-muted-foreground">
            {mode === "signup"
              ? "Free forever for 50 applications and 3 resume scores a month."
              : "Pick up where your search left off."}
          </p>

          <div className="mt-6 flex rounded-[10px] bg-muted p-1">
            {(["signin", "signup"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(undefined);
                }}
                className={cn(
                  "flex-1 rounded-[8px] py-2 text-[13.5px] font-semibold transition",
                  mode === m
                    ? "bg-card text-ink shadow-[0_1px_3px_rgba(16,32,64,0.12)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={google}
            disabled={busy !== null}
            className="mt-5 h-11 w-full rounded-[10px] text-[14.5px] font-semibold"
          >
            {busy === "google" ? <Spinner /> : <FcGoogle className="size-[18px]" />}
            Continue with Google
          </Button>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              or email
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" ? (
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  placeholder="Alex Chen"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            ) : null}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <ErrorNote message={error} />

            <Button
              type="submit"
              disabled={busy !== null}
              className="h-11 w-full rounded-[10px] text-[14.5px] font-semibold"
            >
              {busy === "email" ? <Spinner /> : null}
              {mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="mt-5 text-center text-[13px] text-muted-foreground">
            {mode === "signup" ? "Already have an account? " : "New here? "}
            <button
              type="button"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              className="font-semibold text-primary hover:underline"
            >
              {mode === "signup" ? "Sign in" : "Create one free"}
            </button>
          </p>
        </div>
      </div>

      {/* Proof panel */}
      <div className="hero-sky relative hidden flex-col justify-center p-12 lg:flex">
        <div className="max-w-sm">
          <p className="eyebrow text-navy/60">Lock in and apply</p>
          <h2 className="mt-3 text-[32px] font-bold leading-[1.1] tracking-[-0.025em] text-ink">
            {stats.data?.openJobs ?? "Hundreds of"} junior software roles, already filtered.
          </h2>
          <ul className="mt-7 space-y-3.5">
            {[
              "Straight from company job boards — no recruiter spam",
              "One kanban board for every application you send",
              "AI match scores that never invent experience",
              "Free plan covers a real multi-week search",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-[14.5px] leading-snug text-navy/85">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                  <Check className="size-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="jl-card mt-9 bg-white/80 p-4 backdrop-blur">
            <p className="text-[13.5px] leading-relaxed text-foreground">
              “I was keeping 60 applications in a spreadsheet I'd stopped opening. Now I actually
              know what's live.”
            </p>
            <p className="mt-2.5 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
              CS senior · class of 2027
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
