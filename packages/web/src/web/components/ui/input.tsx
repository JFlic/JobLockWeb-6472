import { cn } from "@/lib/utils";

const base =
  "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm text-foreground shadow-[0_1px_2px_rgba(16,32,64,0.04)] outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 disabled:opacity-50";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(base, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(base, "h-auto min-h-[84px] py-2 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        base,
        "cursor-pointer appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235B6B87' stroke-width='2.2' stroke-linecap='round'><path d='M6 9l6 6 6-6'/></svg>\")",
      }}
      {...props}
    />
  );
}

// Every call site passes htmlFor (enforced by the required prop below), but the
// a11y rule can't see through the wrapper.
export function Label({
  className,
  ...props
}: React.ComponentProps<"label"> & { htmlFor: string }) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control
    <label
      className={cn("mb-1.5 block text-[13px] font-medium text-foreground", className)}
      {...props}
    />
  );
}
