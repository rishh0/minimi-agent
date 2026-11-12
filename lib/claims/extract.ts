import { z } from "zod";
import { groq } from "@/lib/llm/groq";
import { saveClaims, type Claim } from "@/lib/memory/store";
import type { Source } from "@/lib/tools/webSearch";

// A smaller, faster model is enough for extraction (~1s), and it runs in the
// background — the user never waits for it.
const CLAIMS_MODEL = process.env.CLAIMS_MODEL ?? "openai/gpt-oss-20b";

const ClaimsSchema = z.object({
  claims: z
    .array(
      z.object({
        entity: z.string(),
        attribute: z.string(),
        value: z.string(),
        // A list, because the model naturally cites a fact from several sources
        // ([20][21]); a single-number schema made Groq reject the whole output.
        sources: z.array(z.number().int()),
      }),
    ),
  // No .max() here: Groq rejects the WHOLE output when a limit is exceeded (a long
  // comparison produced 54 claims). Accept everything, cap in code below.
});
const MAX_CLAIMS = 25;

const PROMPT = `You extract checkable facts from an assistant's answer so they can be re-verified later.

Rules:
- Only facts that can change over time: prices, plan limits and quotas, versions, launch/release dates, availability, features, company events (funding, acquisitions).
- entity: the product or company the fact is about, by name (e.g. "Neon", "HubSpot"). Never a generic word like "storage" or "plan".
- attribute: what the fact describes, specific enough to re-check on its own (e.g. "Launch plan compute price", "Free tier storage limit").
- value: the exact value as stated, with units and conditions.
- sources: the citation numbers [n] the answer used for this fact (empty list if none).
- Skip opinions, advice, timeless general knowledge, and "no change found" statements. Prefer the most important facts (prices first). At most 20 claims. If there are none, return an empty list.`;

export async function extractClaims(answer: string, sources: Source[]): Promise<Omit<Claim, "observedAt">[]> {
  const res = await groq.chat.completions.create({
    model: CLAIMS_MODEL,
    reasoning_effort: "low", // a simple extraction; don't spend tokens thinking
    temperature: 0,
    messages: [
      { role: "system", content: PROMPT },
      { role: "user", content: answer.slice(0, 6000) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "claims", strict: true, schema: strictSchema() },
    },
  });
  // Structured output guarantees the shape on Groq's side; we still validate in code.
  const parsed = ClaimsSchema.parse(JSON.parse(res.choices[0].message.content ?? "{}"));
  const urlFor = (ns: number[]) => sources.find((s) => ns.includes(s.id))?.url ?? null;
  // The same fact is often cited from two sources — keep one row per entity + attribute.
  const seen = new Set<string>();
  return parsed.claims
    .slice(0, MAX_CLAIMS)
    .filter((c) => {
      const key = `${c.entity}|${c.attribute}`.toLowerCase();
      return !seen.has(key) && seen.add(key);
    })
    .map((c) => ({ entity: c.entity, attribute: c.attribute, value: c.value, sourceUrl: urlFor(c.sources) }));
}

function strictSchema() {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(ClaimsSchema) as Record<string, unknown>;
  void _ignored;
  return schema;
}

// ---- background work ----
// Extraction runs after the answer is saved, without blocking the response.
// Evals call waitForClaims() so the next simulated day sees the claims.
const pending = new Set<Promise<void>>();

export function recordClaimsInBackground(messageId: number, answer: string, sources: Source[], observedAt: string) {
  const job = extractClaims(answer, sources)
    .then((claims) => saveClaims(messageId, claims, observedAt))
    .catch((err) => console.error("[claims] extraction failed:", err instanceof Error ? err.message : err))
    .finally(() => pending.delete(job));
  pending.add(job);
}

export async function waitForClaims() {
  await Promise.all(pending);
}
