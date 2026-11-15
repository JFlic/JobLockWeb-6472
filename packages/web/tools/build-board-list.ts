/**
 * Rebuilds data/boards.json: every Greenhouse, Lever and Ashby board the job
 * sync should pull from.
 *
 * The candidate slugs come from public lists, passed as file paths so nothing
 * here downloads code or data on its own:
 *
 *   bun tools/build-board-list.ts <list.json> [<list.json> ...]
 *
 * Accepted shapes, auto-detected:
 *   - Open Jobs slugs.json (github.com/elliottdehn/open-jobs, CC0 1.0):
 *     { ats: { greenhouse: [slug...], lever: [...], ashby: [...] } }
 *   - ats-company-slugs boards.json (github.com/datakit457/ats-company-slugs):
 *     [{ company, ats, slug }]
 *
 * Each board is probed once against its public API. Only boards that answer
 * 200 are kept, because a dead slug would cost a failed request on every
 * hourly sync forever. Boards with zero open jobs are kept: a company between
 * hiring rounds is exactly the one whose new-grad post we want first.
 *
 * Company names come from the ATS itself (Greenhouse's company_name, Ashby's
 * organization record, the Lever board's page title), so the list never
 * guesses a name from a slug unless the ATS gives none.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SEED_COMPANIES } from "../src/api/lib/seed-companies";

type Ats = "greenhouse" | "lever" | "ashby";
const ATS: Ats[] = ["greenhouse", "lever", "ashby"];

export interface Board {
  name: string;
  ats: Ats;
  slug: string;
  website?: string;
}

const UA = "JobLockBot/1.0 (+https://jobs.thejoblockapp.com)";
const CONCURRENCY = 24;
// Goes into an API path: nothing that could change the URL.
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

async function request(url: string, init: RequestInit = {}): Promise<Response | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "user-agent": UA, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 429 || res.status >= 500) {
        await Bun.sleep(2_000 * (attempt + 1));
        continue;
      }
      return res;
    } catch {
      await Bun.sleep(1_000 * (attempt + 1));
    }
  }
  return null;
}

function prettySlug(slug: string): string {
  return slug
    .replace(/[-_.]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function domainOf(url: unknown): string | undefined {
  if (typeof url !== "string" || !url) return undefined;
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return host.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

async function probeGreenhouse(slug: string): Promise<Board | null> {
  const res = await request(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as { jobs?: { company_name?: string }[] } | null;
  if (!data || !Array.isArray(data.jobs)) return null;
  let name = data.jobs.find((j) => j.company_name)?.company_name;
  if (!name) {
    const board = await request(`https://boards-api.greenhouse.io/v1/boards/${slug}`);
    const info = board?.ok ? ((await board.json().catch(() => null)) as { name?: string } | null) : null;
    name = info?.name;
  }
  return { name: name?.trim() || prettySlug(slug), ats: "greenhouse", slug };
}

async function probeLever(slug: string): Promise<Board | null> {
  const res = await request(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data)) return null;
  const page = await request(`https://jobs.lever.co/${slug}`);
  const html = page?.ok ? await page.text() : "";
  const title = /<title>([^<]{1,120})<\/title>/i.exec(html)?.[1]?.trim();
  return { name: title || prettySlug(slug), ats: "lever", slug };
}

const ASHBY_ORG_QUERY =
  "query ApiOrganizationFromHostedJobsPageName($organizationHostedJobsPageName: String!) { organization: organizationFromHostedJobsPageName(organizationHostedJobsPageName: $organizationHostedJobsPageName) { name publicWebsite } }";

async function probeAshby(slug: string): Promise<Board | null> {
  const res = await request(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  if (!res?.ok) return null;
  const data = (await res.json().catch(() => null)) as { jobs?: unknown[] } | null;
  if (!data || !Array.isArray(data.jobs)) return null;
  const org = await request(
    "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiOrganizationFromHostedJobsPageName",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operationName: "ApiOrganizationFromHostedJobsPageName",
        variables: { organizationHostedJobsPageName: slug },
        query: ASHBY_ORG_QUERY,
      }),
    },
  );
  const info = org?.ok
    ? ((await org.json().catch(() => null)) as {
        data?: { organization?: { name?: string; publicWebsite?: string } | null };
      } | null)
    : null;
  const o = info?.data?.organization;
  return { name: o?.name?.trim() || prettySlug(slug), ats: "ashby", slug, website: domainOf(o?.publicWebsite) };
}

const PROBES: Record<Ats, (slug: string) => Promise<Board | null>> = {
  greenhouse: probeGreenhouse,
  lever: probeLever,
  ashby: probeAshby,
};

/** Candidate boards from every input file, deduplicated case-insensitively. */
async function readCandidates(files: string[]) {
  const out = new Map<string, { ats: Ats; slug: string; name?: string; website?: string }>();
  const add = (ats: unknown, slug: unknown, name?: string, website?: string) => {
    if (!ATS.includes(ats as Ats) || typeof slug !== "string" || !SLUG.test(slug)) return;
    const key = `${ats}:${slug.toLowerCase()}`;
    const prior = out.get(key);
    out.set(key, { ats: ats as Ats, slug: prior?.slug ?? slug, name: prior?.name ?? name, website: prior?.website ?? website });
  };

  for (const c of SEED_COMPANIES) add(c.atsType, c.boardSlug, c.name, c.website);

  for (const file of files) {
    const data = JSON.parse(await readFile(file, "utf8")) as unknown;
    if (Array.isArray(data)) {
      for (const row of data as { ats?: string; slug?: string; company?: string }[]) {
        add(row.ats, row.slug, row.company);
      }
    } else if (data && typeof data === "object" && "ats" in data) {
      const lists = (data as { ats: Record<string, unknown> }).ats;
      for (const ats of ATS) {
        const slugs = lists[ats];
        if (Array.isArray(slugs)) for (const s of slugs) add(ats, s);
      }
    } else {
      throw new Error(`Unrecognized list format: ${file}`);
    }
  }
  return [...out.values()];
}

const files = process.argv.slice(2);
const candidates = await readCandidates(files);
console.log(`Probing ${candidates.length} candidate boards...`);

const kept: Board[] = [];
let done = 0;
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < candidates.length) {
      const c = candidates[next++]!;
      const board = await PROBES[c.ats](c.slug);
      if (board) {
        // A hand-written seed name ("Scale AI") beats what the ATS reports.
        const seed = SEED_COMPANIES.find((s) => s.atsType === c.ats && s.boardSlug === c.slug);
        kept.push({
          ...board,
          name: seed?.name ?? board.name,
          website: seed?.website ?? c.website ?? board.website,
        });
      }
      done += 1;
      if (done % 500 === 0) console.log(`  ${done}/${candidates.length}, ${kept.length} live`);
    }
  }),
);

kept.sort((a, b) => a.ats.localeCompare(b.ats) || a.slug.localeCompare(b.slug));
const out = path.join(import.meta.dir, "..", "data", "boards.json");
// One board per line keeps diffs readable when the list is rebuilt.
await writeFile(out, `[\n${kept.map((b) => JSON.stringify(b)).join(",\n")}\n]\n`);
const counts = Object.fromEntries(ATS.map((a) => [a, kept.filter((b) => b.ats === a).length]));
console.log(`Kept ${kept.length} live boards`, counts, `-> ${path.relative(process.cwd(), out)}`);
