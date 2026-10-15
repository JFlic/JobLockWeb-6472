/**
 * Public ATS job-board fetchers. No API keys needed.
 * We only keep title/location/apply-url plus a short summary — never a mirrored
 * full description on a public page.
 */

export interface RawPosting {
  sourceId: string;
  title: string;
  location: string | null;
  applyUrl: string;
  descriptionText: string;
  postedAt: Date | null;
}

const UA = "JobLockBot/1.0 (+https://joblock.app)";

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&quot;": '"',
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&ldquo;": "“",
  "&rdquo;": "”",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

/**
 * ATS feeds return HTML, and some (Greenhouse) return HTML whose own markup is
 * entity-escaped — so decode, strip, then decode again before trusting the text.
 */
function stripHtml(html: string): string {
  let out = decodeEntities(html);
  for (let pass = 0; pass < 2; pass += 1) {
    out = out
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
    out = decodeEntities(out);
  }
  return out
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Greenhouse — boards-api.greenhouse.io */
async function fetchGreenhouse(slug: string): Promise<RawPosting[]> {
  const data = asRecord(
    await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`),
  );
  const list = Array.isArray(data.jobs) ? data.jobs : [];
  return list.flatMap((entry) => {
    const j = asRecord(entry);
    const id = j.id ?? j.internal_job_id;
    const title = str(j.title);
    const applyUrl = str(j.absolute_url);
    if (!id || !title || !applyUrl) return [];
    const offices = Array.isArray(j.offices) ? j.offices.map((o) => str(asRecord(o).name)) : [];
    const location = str(asRecord(j.location).name) ?? offices.filter(Boolean).join(", ") ?? null;
    const updated = str(j.updated_at) ?? str(j.first_published);
    return [
      {
        sourceId: `greenhouse:${slug}:${String(id)}`,
        title,
        location: location || null,
        applyUrl,
        descriptionText: stripHtml(typeof j.content === "string" ? j.content : ""),
        postedAt: updated ? new Date(updated) : null,
      },
    ];
  });
}

/** Lever — api.lever.co */
async function fetchLever(slug: string): Promise<RawPosting[]> {
  const data = await getJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  const list = Array.isArray(data) ? data : [];
  return list.flatMap((entry) => {
    const j = asRecord(entry);
    const id = str(j.id);
    const title = str(j.text);
    const applyUrl = str(j.hostedUrl) ?? str(j.applyUrl);
    if (!id || !title || !applyUrl) return [];
    const categories = asRecord(j.categories);
    const created = typeof j.createdAt === "number" ? new Date(j.createdAt) : null;
    const description = [
      typeof j.descriptionPlain === "string" ? j.descriptionPlain : stripHtml(String(j.description ?? "")),
      typeof j.additionalPlain === "string" ? j.additionalPlain : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    return [
      {
        sourceId: `lever:${slug}:${id}`,
        title,
        location: str(categories.location),
        applyUrl,
        descriptionText: description.trim(),
        postedAt: created,
      },
    ];
  });
}

/** Ashby — api.ashbyhq.com posting API */
async function fetchAshby(slug: string): Promise<RawPosting[]> {
  const data = asRecord(
    await getJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=false`),
  );
  const list = Array.isArray(data.jobs) ? data.jobs : [];
  return list.flatMap((entry) => {
    const j = asRecord(entry);
    const id = str(j.id);
    const title = str(j.title);
    const applyUrl = str(j.jobUrl) ?? str(j.applyUrl);
    if (!id || !title || !applyUrl) return [];
    const published = str(j.publishedAt) ?? str(j.updatedAt);
    const description =
      typeof j.descriptionPlain === "string"
        ? j.descriptionPlain
        : stripHtml(typeof j.descriptionHtml === "string" ? j.descriptionHtml : "");
    return [
      {
        sourceId: `ashby:${slug}:${id}`,
        title,
        location: str(j.location),
        applyUrl,
        descriptionText: description.trim(),
        postedAt: published ? new Date(published) : null,
      },
    ];
  });
}

export async function fetchBoard(atsType: string, slug: string): Promise<RawPosting[]> {
  switch (atsType) {
    case "greenhouse":
      return fetchGreenhouse(slug);
    case "lever":
      return fetchLever(slug);
    case "ashby":
      return fetchAshby(slug);
    default:
      throw new Error(`Unknown ATS type: ${atsType}`);
  }
}

/* ---------------------------------- tagging --------------------------------- */

const SENIOR_MARKERS = [
  "senior",
  "staff",
  "principal",
  "lead ",
  "manager",
  "director",
  "head of",
  "architect",
  " iii",
  " iv",
  "vp ",
  "distinguished",
  "fellow",
];

const SWE_MARKERS = [
  "software",
  "engineer",
  "engineering",
  "developer",
  "programmer",
  "sde",
  "swe",
  "full stack",
  "fullstack",
  "backend",
  "back end",
  "frontend",
  "front end",
  "machine learning",
  "data engineer",
  "infrastructure",
  "platform engineer",
  "site reliability",
  "security engineer",
  "mobile engineer",
  "ios engineer",
  "android engineer",
  "computer sci",
];

const INTERN_MARKERS = ["intern", "internship", "co-op", "coop ", "summer 20", "apprentice"];
const NEW_GRAD_MARKERS = [
  "new grad",
  "new graduate",
  "newgrad",
  "university grad",
  "university graduate",
  "campus",
  "grad program",
  "graduate program",
  "graduate software",
  "early career",
  "early-career",
  "entry level",
  "entry-level",
  "class of 20",
  "recent graduate",
];
const JUNIOR_MARKERS = ["junior", "jr.", "jr ", "associate", "engineer i", "engineer 1", "level 1"];

const VISA_MARKERS = [
  "visa sponsor",
  "sponsor visa",
  "sponsorship available",
  "will sponsor",
  "we sponsor",
  "h-1b",
  "h1b",
  "immigration support",
  "relocation and visa",
];

const REMOTE_MARKERS = ["remote", "anywhere", "distributed", "work from home", "wfh"];

export type Level = "intern" | "new_grad" | "junior" | "other";

function has(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/** Is this even a software/technical role we care about? */
export function isSoftwareRole(title: string): boolean {
  return has(title.toLowerCase(), SWE_MARKERS);
}

export function classifyLevel(title: string, description: string): Level {
  const t = ` ${title.toLowerCase()} `;
  const d = description.toLowerCase().slice(0, 4000);

  if (has(t, INTERN_MARKERS)) return "intern";
  if (has(t, SENIOR_MARKERS)) return "other";
  if (has(t, NEW_GRAD_MARKERS)) return "new_grad";
  if (has(t, JUNIOR_MARKERS)) return "junior";

  // Title is neutral (e.g. "Software Engineer") — look for signals in the body.
  if (has(d, ["new grad", "new graduate", "university graduate", "recent graduate", "class of 20"]))
    return "new_grad";
  if (has(d, ["0-2 years", "0–2 years", "1-2 years", "1+ year", "entry level", "entry-level"]))
    return "junior";
  return "other";
}

export function detectRemote(location: string | null, description: string): boolean {
  const l = (location ?? "").toLowerCase();
  if (has(l, REMOTE_MARKERS)) return true;
  return has(description.toLowerCase().slice(0, 1500), ["fully remote", "remote-first", "remote first"]);
}

export function detectVisaSponsorship(description: string): boolean {
  const d = description.toLowerCase();
  if (has(d, ["not sponsor", "cannot sponsor", "unable to sponsor", "no visa sponsorship"])) return false;
  return has(d, VISA_MARKERS);
}

/** One short paragraph, kept well under fair-use length. */
export function buildSummary(description: string): string {
  const clean = description.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const cut = clean.slice(0, 280);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
  return (lastStop > 120 ? cut.slice(0, lastStop + 1) : cut).trim();
}
