import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { auth } from "../auth";

/** Procedure base that requires a signed-in user. */
export const authed = base.use(async ({ next, context }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  if (!session?.user) {
    throw new ORPCError("UNAUTHORIZED", { message: "Sign in to continue." });
  }
  return next({ context: { user: session.user } });
});

/** Procedure base where the user is optional (public data, personalized when signed in). */
export const maybeAuthed = base.use(async ({ next, context }) => {
  const session = await auth.api.getSession({ headers: context.headers }).catch(() => null);
  return next({ context: { user: session?.user ?? null } });
});
