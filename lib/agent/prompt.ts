import type { DateRef } from "@/lib/time/resolve";
import type { MemoryResult } from "@/lib/memory/retrieve";

// Kept free of anything that changes per request (like the date), so every request
// starts with the exact same prefix — that's what lets the provider cache it.
export const SYSTEM_PROMPT = `You are a fast, accurate research assistant with a web_search tool.

When to search:
- Search for anything time-sensitive (pricing, releases, news, "latest", "still true?") or anything you are not sure about.
- Don't search for greetings, small talk, or general knowledge that doesn't change.
- Put all the queries you need into ONE web_search call (up to 5, one product per query); they run in parallel. Only search again if the results were insufficient.
- To check prices or plans, search "<product> pricing". For news since a date, search "<product> announcement" with start_date from the Time context.

How to answer:
- Lead with the answer. Be concise; use short bullets or a small table when comparing.
- Cite sources inline as [1] or [1][3] using the numbers from the search results — plain square brackets only, never 【】 or line references. Only cite what the sources actually say.
- If sources conflict or are outdated, say so. If you couldn't verify something, say that plainly instead of guessing.

Dates:
- A "Time context" note gives the current date and resolves the user's date phrases. Trust it over your own date arithmetic.

Memory of past conversations:
- When the user refers to earlier conversations, a "Memory" note lists what was retrieved from the database. It is the ONLY source of truth about the past.
- If the Memory note says nothing was found, say plainly that you have no record of it. Never invent past questions or answers.
- When asked whether a past answer is "still correct" or what "changed since", search for the current facts, then compare claim by claim: what is unchanged, what changed (old → new, with citation), and what you could not verify.`;

// Per-request facts, sent as a separate system message AFTER the history.
export function timeContext(nowLabel: string, timeZone: string, refs: DateRef[]): string {
  const lines = [`Time context — now: ${nowLabel} (${timeZone}).`];
  if (refs.length) {
    lines.push("Date phrases in the user's latest message, resolved by code:");
    for (const r of refs) lines.push(`- "${r.text}" = ${r.label} (${r.startDate} to ${r.endDate})`);
  }
  return lines.join("\n");
}

// What memory retrieval found (or explicitly didn't find) — so "no record" is a fact, not a guess.
export function memoryNote(memory: MemoryResult, timeZone: string): string {
  if (!memory.turns.length) {
    return `Memory — searched past conversations (${memory.searchedFor}): NOTHING FOUND. Tell the user you have no record of it.`;
  }
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n) + "…" : t);
  const lines = [`Memory — past conversations retrieved for (${memory.searchedFor}):`];
  for (const t of memory.turns) {
    lines.push(`\n[${when(t.askedAt)} — chat "${t.conversationTitle}"]`);
    lines.push(`User asked: ${clip(t.question, 300)}`);
    if (t.claims.length) {
      // Structured facts are more precise (and smaller) than the prose answer.
      lines.push(`You answered: ${t.answer ? clip(t.answer, 250) : ""}`);
      lines.push("Facts you stated then (verify each one):");
      for (const c of t.claims) lines.push(`- ${c.entity} | ${c.attribute} | ${c.value}${c.sourceUrl ? ` | source: ${c.sourceUrl}` : ""}`);
    } else {
      lines.push(`You answered: ${t.answer ? clip(t.answer, 700) : "(no answer saved)"}`);
    }
  }
  return lines.join("\n");
}
