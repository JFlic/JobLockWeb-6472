/**
 * Seed set of companies whose public ATS boards we ingest.
 * Every slug here was verified to return live postings from its ATS endpoint.
 */

export interface SeedCompany {
  name: string;
  atsType: "greenhouse" | "lever" | "ashby";
  boardSlug: string;
  website: string;
}

export const SEED_COMPANIES: SeedCompany[] = [
  // Greenhouse
  { name: "Stripe", atsType: "greenhouse", boardSlug: "stripe", website: "stripe.com" },
  { name: "Airbnb", atsType: "greenhouse", boardSlug: "airbnb", website: "airbnb.com" },
  { name: "Dropbox", atsType: "greenhouse", boardSlug: "dropbox", website: "dropbox.com" },
  { name: "Coinbase", atsType: "greenhouse", boardSlug: "coinbase", website: "coinbase.com" },
  { name: "Robinhood", atsType: "greenhouse", boardSlug: "robinhood", website: "robinhood.com" },
  { name: "Instacart", atsType: "greenhouse", boardSlug: "instacart", website: "instacart.com" },
  { name: "Reddit", atsType: "greenhouse", boardSlug: "reddit", website: "reddit.com" },
  { name: "Databricks", atsType: "greenhouse", boardSlug: "databricks", website: "databricks.com" },
  { name: "GitLab", atsType: "greenhouse", boardSlug: "gitlab", website: "gitlab.com" },
  { name: "Discord", atsType: "greenhouse", boardSlug: "discord", website: "discord.com" },
  { name: "Twitch", atsType: "greenhouse", boardSlug: "twitch", website: "twitch.tv" },
  { name: "Cloudflare", atsType: "greenhouse", boardSlug: "cloudflare", website: "cloudflare.com" },
  { name: "Figma", atsType: "greenhouse", boardSlug: "figma", website: "figma.com" },
  { name: "Lyft", atsType: "greenhouse", boardSlug: "lyft", website: "lyft.com" },
  { name: "Pinterest", atsType: "greenhouse", boardSlug: "pinterest", website: "pinterest.com" },
  { name: "Asana", atsType: "greenhouse", boardSlug: "asana", website: "asana.com" },
  { name: "Affirm", atsType: "greenhouse", boardSlug: "affirm", website: "affirm.com" },
  { name: "Flexport", atsType: "greenhouse", boardSlug: "flexport", website: "flexport.com" },
  { name: "Samsara", atsType: "greenhouse", boardSlug: "samsara", website: "samsara.com" },
  { name: "Chime", atsType: "greenhouse", boardSlug: "chime", website: "chime.com" },
  { name: "Scale AI", atsType: "greenhouse", boardSlug: "scaleai", website: "scale.com" },
  { name: "Gusto", atsType: "greenhouse", boardSlug: "gusto", website: "gusto.com" },
  { name: "Webflow", atsType: "greenhouse", boardSlug: "webflow", website: "webflow.com" },
  { name: "Airtable", atsType: "greenhouse", boardSlug: "airtable", website: "airtable.com" },
  { name: "Mixpanel", atsType: "greenhouse", boardSlug: "mixpanel", website: "mixpanel.com" },
  { name: "MongoDB", atsType: "greenhouse", boardSlug: "mongodb", website: "mongodb.com" },
  { name: "Elastic", atsType: "greenhouse", boardSlug: "elastic", website: "elastic.co" },
  { name: "Faire", atsType: "greenhouse", boardSlug: "faire", website: "faire.com" },
  { name: "Betterment", atsType: "greenhouse", boardSlug: "betterment", website: "betterment.com" },
  { name: "SoFi", atsType: "greenhouse", boardSlug: "sofi", website: "sofi.com" },
  { name: "EarnIn", atsType: "greenhouse", boardSlug: "earnin", website: "earnin.com" },

  // Lever
  { name: "Palantir", atsType: "lever", boardSlug: "palantir", website: "palantir.com" },
  { name: "Spotify", atsType: "lever", boardSlug: "spotify", website: "spotify.com" },
  { name: "Match Group", atsType: "lever", boardSlug: "matchgroup", website: "mtch.com" },
  { name: "Veeva Systems", atsType: "lever", boardSlug: "veeva", website: "veeva.com" },

  // Ashby
  { name: "OpenAI", atsType: "ashby", boardSlug: "openai", website: "openai.com" },
  { name: "Notion", atsType: "ashby", boardSlug: "notion", website: "notion.so" },
  { name: "Ramp", atsType: "ashby", boardSlug: "ramp", website: "ramp.com" },
  { name: "Linear", atsType: "ashby", boardSlug: "linear", website: "linear.app" },
  { name: "Cursor", atsType: "ashby", boardSlug: "cursor", website: "cursor.com" },
  { name: "Ashby", atsType: "ashby", boardSlug: "ashby", website: "ashbyhq.com" },
  { name: "Harvey", atsType: "ashby", boardSlug: "harvey", website: "harvey.ai" },
  { name: "ElevenLabs", atsType: "ashby", boardSlug: "elevenlabs", website: "elevenlabs.io" },
  { name: "Replit", atsType: "ashby", boardSlug: "replit", website: "replit.com" },
  { name: "Modal", atsType: "ashby", boardSlug: "modal", website: "modal.com" },
  { name: "Browserbase", atsType: "ashby", boardSlug: "browserbase", website: "browserbase.com" },
  { name: "Decagon", atsType: "ashby", boardSlug: "decagon", website: "decagon.ai" },
  { name: "Supabase", atsType: "ashby", boardSlug: "supabase", website: "supabase.com" },
];

/** Favicon-based logo, no API key required. */
export function logoFor(website: string | null): string | null {
  if (!website) return null;
  return `https://www.google.com/s2/favicons?domain=${website}&sz=128`;
}
