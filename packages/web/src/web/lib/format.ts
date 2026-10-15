const LEVEL_LABELS: Record<string, string> = {
  intern: "Internship",
  new_grad: "New grad",
  junior: "Junior",
  other: "Engineering",
};

export function levelLabel(level?: string | null) {
  if (!level) return "Engineering";
  return LEVEL_LABELS[level] ?? "Engineering";
}

export function relativeTime(value?: Date | string | number | null) {
  if (!value) return "recently";
  const date = value instanceof Date ? value : new Date(value);
  const ms = Date.now() - date.getTime();
  if (Number.isNaN(ms)) return "recently";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function shortDate(value?: Date | string | number | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Deterministic pastel background for a company mark. */
export function markColor(seed: string) {
  const palette = ["#1D4ED8", "#0F9D76", "#D9820A", "#132542", "#6FA8F0", "#7c3aed"];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  return palette[hash % palette.length]!;
}

export function compactNumber(value?: number | null) {
  if (value === null || value === undefined) return "—";
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}k`;
}
