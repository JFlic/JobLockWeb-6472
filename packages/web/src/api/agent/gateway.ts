import { createGateway } from "ai";
import { ORPCError } from "@orpc/server";

export const gateway = createGateway({
  // An empty AI_GATEWAY_BASE_URL (as the .env template ships) must fall back
  // to the SDK default rather than become a relative "" base URL.
  baseURL: process.env.AI_GATEWAY_BASE_URL || undefined,
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

/** Cheap, fast model — resume work is short-context and high-volume. */
export const RESUME_MODEL = "anthropic/claude-haiku-4.5";

/**
 * Runs one AI call and turns every way it can fail into a message a person can
 * act on. Without this, a missing key or a provider outage surfaced in the UI
 * as a bare "Internal server error". Called before metering is recorded, so a
 * failed run never costs the user a credit.
 */
export async function withAi<T>(run: () => Promise<T>): Promise<T> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "AI resume tools aren't switched on yet. Check back soon.",
    });
  }
  try {
    return await run();
  } catch (error) {
    if (error instanceof ORPCError) throw error;
    console.error("[ai] request failed:", error);
    throw new ORPCError("BAD_GATEWAY", {
      message: "The AI service didn't respond. Try again in a minute.",
    });
  }
}
