// OPTIONAL demo data. A fresh install has no history, so questions like "Last Tuesday
// I asked you about Postgres hosting…" correctly get "I have no record of that".
// This script creates those past conversations on the right days (relative to today,
// in your timezone) by running real agent turns with the clock set back.
// Run: npm run seed-demo   (~2 minutes; uses your Groq + Tavily keys)
import { chatTurn } from "@/lib/agent/chat";
import { setNow } from "@/lib/time/clock";
import { waitForClaims } from "@/lib/claims/extract";
import { resolveDates } from "@/lib/time/resolve";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const today = new Date();

// Local "<day phrase> at <hour>:00" → UTC instant, using the same resolver the agent uses.
function at(dayPhrase: string, hour: number): Date | null {
  const [ref] = resolveDates(dayPhrase, today, timeZone);
  if (!ref) return null;
  const when = new Date(new Date(ref.startUtc).getTime() + hour * 3_600_000);
  return when < today ? when : null; // only seed the past
}

const seeds = [
  {
    when: at("last Monday", 11),
    message: "We're choosing a CRM for our 20-person sales team. Shortlist the 5 best options with their current per-seat pricing.",
  },
  {
    when: at("last Tuesday", 16),
    message: "What are the cheapest managed Postgres hosting options for a small SaaS? Compare Neon, Supabase and AWS RDS pricing.",
  },
  { when: at("on 3 November", 10), message: "What does Neon charge for its Launch plan?" },
];

console.log(`Seeding demo history (timezone: ${timeZone})`);
for (const [i, seed] of seeds.entries()) {
  if (!seed.when) continue;
  setNow(seed.when);
  process.stdout.write(`- ${seed.when.toLocaleString("en-GB", { timeZone })}: "${seed.message}" … `);
  let ok = true;
  for await (const e of chatTurn({ message: seed.message, timeZone })) if (e.type === "error") ok = false;
  await waitForClaims();
  console.log(ok ? "done" : "failed (see server logs)");
  // Stay under Groq's free-tier tokens-per-minute limit.
  if (i < seeds.length - 1) await new Promise((r) => setTimeout(r, 40_000));
}
console.log("Now run `npm run dev` and ask about those conversations.");
