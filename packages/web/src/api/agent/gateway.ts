import { createGateway } from "ai";

export const gateway = createGateway({
  baseURL: process.env.AI_GATEWAY_BASE_URL,
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

/** Cheap, fast model — resume work is short-context and high-volume. */
export const RESUME_MODEL = "anthropic/claude-haiku-4.5";
