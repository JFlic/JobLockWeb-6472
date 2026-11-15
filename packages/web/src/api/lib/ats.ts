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
  /**
   * Plain-text description, or null when the board's listing doesn't carry it.
   * Greenhouse lists jobs without content; `fetchDescriptions` fills it in, so
   * a sync only downloads full descriptions for boards where something changed.
   */
  descriptionText: string | null;
  postedAt: Date | null;
}

/** A board that answered 404: the company left that ATS or renamed its slug. */
export class BoardGoneError extends Error {}

const UA = "JobLockBot/1.0 (+https://jobs.thejoblockapp.com)";

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
  // Greenhouse answers a burst of requests with 403 (not 429) for a while,
  // so both count as "slow down". A real 404 is final.
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 404) throw new BoardGoneError(`404 for ${url}`);
    if (res.ok) return res.json();
    const throttled = res.status === 403 || res.status === 429 || res.status >= 500;
    if (!throttled || attempt >= 2) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, 5_000 * 3 ** attempt));
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Greenhouse — boards-api.greenhouse.io */
function greenhousePostings(slug: string, list: unknown[], withContent: boolean): RawPosting[] {
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
        descriptionText: withContent
          ? stripHtml(typeof j.content === "string" ? j.content : "")
          : null,
        postedAt: updated ? new Date(updated) : null,
      },
    ];
  });
}

async function fetchGreenhouse(slug: string, withContent: boolean): Promise<RawPosting[]> {
  // Without content the listing is a few KB; with it, a large board is tens of MB.
  const data = asRecord(
    await getJson(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs${withContent ? "?content=true" : ""}`,
    ),
  );
  return greenhousePostings(slug, Array.isArray(data.jobs) ? data.jobs : [], withContent);
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

/** A board's postings. Greenhouse ones come back without descriptions. */
export async function fetchBoard(atsType: string, slug: string): Promise<RawPosting[]> {
  switch (atsType) {
    case "greenhouse":
      return fetchGreenhouse(slug, false);
    case "lever":
      return fetchLever(slug);
    case "ashby":
      return fetchAshby(slug);
    default:
      throw new Error(`Unknown ATS type: ${atsType}`);
  }
}

/** Descriptions by sourceId, for boards whose listing left them out. */
export async function fetchDescriptions(atsType: string, slug: string): Promise<Map<string, string>> {
  const postings = atsType === "greenhouse" ? await fetchGreenhouse(slug, true) : await fetchBoard(atsType, slug);
  return new Map(postings.map((p) => [p.sourceId, p.descriptionText ?? ""]));
}

/* ---------------------------------- tagging --------------------------------- */

const SENIOR_MARKERS = [
  "senior",
  "sr.",
  " sr ",
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

/**
 * Title words that make a posting a software role. Bare "engineer" is not one
 * of them: with ~10k boards it pulled in test, launch, mechanical and
 * manufacturing engineers by the hundred.
 */
const SWE_MARKERS = [
  "software",
  "developer",
  "programmer",
  "sde",
  "swe",
  "full stack",
  "full-stack",
  "fullstack",
  "backend",
  "back end",
  "back-end",
  "frontend",
  "front end",
  "front-end",
  "web engineer",
  "machine learning",
  "ml engineer",
  "ai engineer",
  "data engineer",
  "infrastructure engineer",
  "platform engineer",
  "cloud engineer",
  "devops",
  "site reliability",
  "sre",
  "security engineer",
  "mobile engineer",
  "ios",
  "android",
  "product engineer",
  "forward deployed",
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
// Trailing spaces matter: "engineer i" alone also matches "Engineer II".
// The title is padded with a space at each end before matching.
const JUNIOR_MARKERS = ["junior", "jr.", "jr ", "associate", "engineer i ", "engineer 1 ", "level 1 ", "developer i ", "developer 1 "];

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
  // Word-bounded, so "sre" doesn't match "Sresearch" and "ios" not "Biostatistics".
  const t = ` ${title.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ")} `;
  return SWE_MARKERS.some((m) => t.includes(` ${m.replace(/-/g, " ")} `) || t.includes(` ${m.replace(/-/g, " ")}s `));
}

/**
 * The level the title alone settles, or null when the title is neutral
 * ("Software Engineer") and only the description can tell.
 */
export function levelFromTitle(title: string): Level | null {
  const t = ` ${title.toLowerCase()} `;
  if (has(t, INTERN_MARKERS)) return "intern";
  if (has(t, SENIOR_MARKERS)) return "other";
  if (has(t, NEW_GRAD_MARKERS)) return "new_grad";
  if (has(t, JUNIOR_MARKERS)) return "junior";
  return null;
}

export function classifyLevel(title: string, description: string): Level {
  const fromTitle = levelFromTitle(title);
  if (fromTitle) return fromTitle;
  const d = description.toLowerCase().slice(0, 4000);

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
