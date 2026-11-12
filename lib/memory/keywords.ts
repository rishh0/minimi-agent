// Pure text helpers for memory retrieval (no database), so they're unit-testable.

// Phrases that mean "this is about our past conversations". Retrieval only runs
// when one appears: "Has Supabase announced anything since Monday?" has a date
// but is about the world, not about us — injecting old chats there is just noise.
const MEMORY_CUE =
  /\b(I|we)\s+(asked|ask|told|said|shortlisted|discussed|talked|mentioned|compared|looked)\b|\byou\s+(said|told|answered|recommended|suggested|mentioned)\b|\b(did|have)\s+I\b|\b(last time|earlier|before|previously|remember|our (chat|conversation)|still (correct|true|valid|accurate|right)|your (answer|reply))\b/i;

export function isAboutMemory(message: string): boolean {
  return MEMORY_CUE.test(message);
}

const STOPWORDS = new Set(
  "the and for you your our are was were did does what when where which who how has have had any anything since about with this that from then them they their there here been into than just also only last week month today yesterday monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december ask asked told said still correct true answer changed change shipped something big tools tool".split(
    " ",
  ),
);

// "Last Tuesday I asked you about Postgres hosting" → "postgres" OR "hosting"
export function keywordQuery(message: string): string | null {
  const words = message
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9.+-]{2,}/g)
    ?.filter((w) => !STOPWORDS.has(w) && !/^\d+(st|nd|rd|th)?$/.test(w));
  if (!words?.length) return null;
  return [...new Set(words)].map((w) => `"${w.replace(/"/g, "")}"`).join(" OR ");
}
