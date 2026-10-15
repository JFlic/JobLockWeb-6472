import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("jl-pill", {
  variants: {
    tone: {
      blue: "bg-accent text-accent-foreground",
      mint: "bg-mint/12 text-mint",
      amber: "bg-amber/12 text-amber",
      gray: "bg-muted text-muted-foreground",
      sky: "bg-sky-3 text-[#13398f]",
      solid: "bg-primary text-primary-foreground",
      danger: "bg-destructive/10 text-destructive",
      onDark: "bg-white/12 text-white",
    },
  },
  defaultVariants: { tone: "gray" },
});

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
