import { createGateway, type LanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { ORPCError } from "@orpc/server";
import { MODELS, resolveProvider, topUpUrlFrom402 } from "../publik";

export const gateway = createGateway({
  // An empty AI_GATEWAY_BASE_URL (as the .env template ships) must fall back
  // to the SDK default rather than become a relative "" base URL.
  baseURL: process.env.AI_GATEWAY_BASE_URL || undefined,
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

/** Cheap, fast model — resume work is short-context and high-volume. */
export const RESUME_MODEL = "anthropic/claude-haiku-4.5";

/**
 * Picks who serves the resume model. The publik module decides: PUBLIK_API_KEY
 * (how the hosted site runs, set in Vercel), or a local clone whose owner chose
 * "Connect your plan" at start-up, gets publik API; otherwise the builder's own
 * AI Gateway key, exactly as before publik existed.
 */
function resumeModel(): LanguageModel {
  const own = process.env.AI_GATEWAY_API_KEY
    ? { baseURL: process.env.AI_GATEWAY_BASE_URL || "gateway", apiKey: process.env.AI_GATEWAY_API_KEY }
    : null;
  const p = resolveProvider(own);
  if (p.kind === "own") return gateway(RESUME_MODEL);
  if (p.kind === "publik") {
    // publik serves tiers, never vendor model names.
    return createOpenAICompatible({
      name: "publik",
      baseURL: p.baseURL,
      apiKey: p.apiKey,
      supportsStructuredOutputs: true,
    }).chatModel(MODELS.fast);
  }
  throw new ORPCError("SERVICE_UNAVAILABLE", {
    message: "AI resume tools aren't switched on yet. Check back soon.",
  });
}

/** Status and body of a failed provider call, whichever SDK error shape carries them. */
function httpFailure(error: unknown): { status?: number; body?: unknown } {
  const e = error as { statusCode?: number; responseBody?: string; lastError?: unknown };
  if (e?.lastError) return httpFailure(e.lastError);
  let body: unknown;
  try {
    body = e?.responseBody ? JSON.parse(e.responseBody) : undefined;
  } catch {
    body = undefined;
  }
  return { status: e?.statusCode, body };
}

/**
 * Runs one AI call and turns every way it can fail into a message a person can
 * act on. Without this, a missing key or a provider outage surfaced in the UI
 * as a bare "Internal server error". Called before metering is recorded, so a
 * failed run never costs the user a credit.
 */
export async function withAi<T>(run: (model: LanguageModel) => Promise<T>): Promise<T> {
  const model = resumeModel();
  try {
    return await run(model);
  } catch (error) {
    if (error instanceof ORPCError) throw error;
    console.error("[ai] request failed:", error);
    const { status, body } = httpFailure(error);
    if (status === 402) {
      // On the hosted site the balance is the builder's, not the visitor's, so a
      // top-up link would ask a stranger to pay for someone else's account.
      const { message, url } = topUpUrlFrom402(body);
      throw new ORPCError("PAYMENT_REQUIRED", {
        message: process.env.VERCEL
          ? "AI resume tools are out of credit right now. Try again later."
          : url
            ? `${message} ${url}`
            : message,
      });
    }
    throw new ORPCError("BAD_GATEWAY", {
      message: "The AI service didn't respond. Try again in a minute.",
    });
  }
}
