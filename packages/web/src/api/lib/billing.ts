import { Autumn } from "autumn-js";
import { ORPCError } from "@orpc/server";

const autumn = new Autumn();

export const FEATURES = {
  resumeScore: "resume_score",
  resumeTailor: "resume_tailor",
  trackerSlots: "tracker_slots",
  weeklyDigest: "weekly_digest",
} as const;

export type FeatureId = (typeof FEATURES)[keyof typeof FEATURES];

/** Make sure the Autumn customer exists (covers users created before the hook). */
export async function ensureCustomer(user: { id: string; name?: string | null; email?: string | null }) {
  try {
    await autumn.customers.getOrCreate({
      customerId: user.id,
      name: user.name ?? undefined,
      email: user.email ?? undefined,
    });
  } catch (e) {
    console.error("[autumn] getOrCreate failed:", e);
  }
}

/**
 * Server-side gate. Throws a typed error the client turns into an upgrade prompt.
 * Never gate only in the browser.
 */
export async function requireFeature(
  userId: string,
  featureId: FeatureId,
  requiredBalance = 1,
): Promise<void> {
  try {
    const res = await autumn.check({ customerId: userId, featureId, requiredBalance });
    if (res.allowed === false) {
      throw new ORPCError("PAYMENT_REQUIRED", {
        message: "You've used everything your plan includes this month. Upgrade to keep going.",
        data: { featureId },
      });
    }
  } catch (e) {
    if (e instanceof ORPCError) throw e;
    // Billing service hiccup — don't hard-block the user's work.
    console.error("[autumn] check failed:", e);
  }
}

/** Record consumption after a successful paid action. */
export async function trackFeature(userId: string, featureId: FeatureId, value = 1): Promise<void> {
  try {
    await autumn.track({ customerId: userId, featureId, value });
  } catch (e) {
    console.error("[autumn] track failed:", e);
  }
}

/** Read remaining balance for a feature, or null when it can't be determined. */
export async function featureBalance(userId: string, featureId: FeatureId) {
  try {
    const res = await autumn.check({ customerId: userId, featureId });
    const balance = res.balance;
    return {
      allowed: res.allowed ?? true,
      unlimited: balance?.unlimited ?? false,
      remaining: balance?.remaining ?? null,
      granted: balance?.granted ?? null,
      usage: balance?.usage ?? null,
    };
  } catch (e) {
    console.error("[autumn] balance read failed:", e);
    return null;
  }
}
