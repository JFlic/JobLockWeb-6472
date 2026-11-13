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

/**
 * Google sign-in goes through Runable's managed auth, which exists only when
 * its issuer is configured — the same condition api/auth.ts uses to mount the
 * plugin. Off Runable (Vercel, local) the button would just fail, so hide it.
 */
export const GOOGLE_SIGN_IN = Boolean(import.meta.env.VITE_RUNABLE_AUTH_ISSUER);
