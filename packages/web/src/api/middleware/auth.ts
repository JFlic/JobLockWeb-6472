import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { auth } from "../auth";

/**
 * Local-only escape hatch: with LOCAL_NO_AUTH=true in a non-production env,
 * every request runs as one fixed local user so features can be tried without
 * signing in. Ignored entirely in production.
 */
const NO_AUTH = process.env.LOCAL_NO_AUTH === "true" && process.env.NODE_ENV !== "production";

type User = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>["user"];

const LOCAL_USER = {
  id: "local-dev",
  name: process.env.LOCAL_USER_NAME || "Local User",
  email: "local@localhost",
  emailVerified: true,
  image: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
} as User;

/** Procedure base that requires a signed-in user. */
export const authed = base.use(async ({ next, context }) => {
  if (NO_AUTH) return next({ context: { user: LOCAL_USER } });
  const session = await auth.api.getSession({ headers: context.headers });
  if (!session?.user) {
    throw new ORPCError("UNAUTHORIZED", { message: "Sign in to continue." });
  }
  return next({ context: { user: session.user } });
});

/** Procedure base where the user is optional (public data, personalized when signed in). */
export const maybeAuthed = base.use(async ({ next, context }) => {
  if (NO_AUTH) return next({ context: { user: LOCAL_USER as User | null } });
  const session = await auth.api.getSession({ headers: context.headers }).catch(() => null);
  return next({ context: { user: session?.user ?? null } });
});
