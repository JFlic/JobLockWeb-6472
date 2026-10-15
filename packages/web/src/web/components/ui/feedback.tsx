import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-[10px] bg-muted", className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} />;
}

export function Loading({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn("flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground", className)}
    >
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorNote({ message, className }: { message?: string; className?: string }) {
  if (!message) return null;
  return (
    <p
      className={cn(
        "rounded-[10px] border border-destructive/25 bg-destructive/8 px-3 py-2 text-[13px] text-destructive",
        className,
      )}
    >
      {message}
    </p>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("jl-card flex flex-col items-center gap-2 px-6 py-14 text-center", className)}>
      <p className="text-base font-semibold text-foreground">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
