import Groq, { APIError, RateLimitError } from "groq-sdk";

export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
export const MODEL = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
// Groq rate limits are per model, so a smaller model still has quota when the main
// one hits its daily cap (free tier: 200K tokens/day ≈ 30 search-heavy turns).
export const FALLBACK_MODEL = process.env.GROQ_FALLBACK_MODEL ?? "openai/gpt-oss-20b";

export const isDailyLimit = (err: unknown) =>
  err instanceof RateLimitError && /per day|\bTPD\b|\bRPD\b/i.test(err.message);

// Errors the user sees: short and actionable, never a raw JSON payload.
export function friendlyError(err: unknown): string {
  if (err instanceof RateLimitError) {
    const wait = err.message.match(/try again in ([\dhms.]+)/i)?.[1];
    return `The AI provider's rate limit was reached${wait ? ` — try again in ${wait.replace(/\.\d+s$/, "s")}` : ""}.`;
  }
  if (err instanceof APIError && err.status === 401) return "The Groq API key is missing or invalid (see .env.example).";
  if (err instanceof APIError) return `The AI provider returned an error (${err.status}). Please try again.`;
  return err instanceof Error ? err.message : String(err);
}
