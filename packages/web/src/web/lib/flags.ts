/**
 * Pricing is hidden for now: no Pricing page or links, no "Start free" CTAs,
 * no plan/usage counters or upgrade nudges. Flip to true to bring it all back.
 */
export const SHOW_PRICING = true;

/**
 * Local dev only: skip sign-in screens (VITE_LOCAL_NO_AUTH=true in .env). The
 * server honours the matching LOCAL_NO_AUTH flag. Always off in production builds.
 */
export const NO_AUTH = import.meta.env.DEV && import.meta.env.VITE_LOCAL_NO_AUTH === "true";
