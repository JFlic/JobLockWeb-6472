import { cn } from "@/lib/utils";

/** Job Lock brand mark — a padlock whose shackle doubles as a checkmark. */
export function Lockmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-8", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="5" y="13" width="22" height="16" rx="4.5" fill="currentColor" />
      <path
        d="M10 13.5V10a6 6 0 0 1 12 0v3.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M12.4 21.2l2.6 2.6 4.8-5"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
