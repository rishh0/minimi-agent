// Scenario evals: replays multi-day conversations against a throwaway in-memory
// database, with a fake clock, and checks what the agent DID (memory hits, searches,
// date filters, latency) and what it SAID. Uses real Groq + Tavily calls.
//
// Run: npm run eval                 (all scenarios)
//      npm run eval -- crm no-record (only scenarios whose id contains these words)
import fs from "node:fs";
import type { AgentEvent } from "@/lib/agent/events";

// Must be set before lib/memory/db.ts is imported (it opens the database on import).
process.env.DB_PATH = ":memory:";
const { chatTurn } = await import("@/lib/agent/chat");
const { setNow } = await import("@/lib/time/clock");
const { waitForClaims } = await import("@/lib/claims/extract");
const { db } = await import("@/lib/memory/db");

// ---- what one turn looks like from the outside ----

type TurnResult = {
  text: string;
  memoryFound: number | null; // null = memory retrieval didn't run
  searches: { queries: string[]; startDate?: string }[];
  sources: number;
  errors: string[];
  firstTokenMs: number | null;
  totalMs: number;
};

type Check = { name: string; pass: (r: TurnResult) => boolean };

type Turn = {
  at: string; // ISO instant the fake clock is pinned to
  timeZone: string;
  message: string;
  checks: Check[];
};

type Scenario = { id: string; description: string; turns: Turn[] };

// ---- reusable checks ----

const searched = (min = 1): Check => ({
  name: `searched the web (≥${min} queries)`,
  pass: (r) => r.searches.flatMap((s) => s.queries).length >= min,
});
const didNotSearch: Check = { name: "did not search", pass: (r) => r.searches.length === 0 };
const memory = (expected: number | ((n: number) => boolean), label?: string): Check => ({
  name: `memory found ${label ?? expected}`,
  pass: (r) => r.memoryFound !== null && (typeof expected === "number" ? r.memoryFound === expected : expected(r.memoryFound)),
});
const memorySkipped: Check = { name: "memory retrieval skipped (not about the past)", pass: (r) => r.memoryFound === null };
const says = (pattern: RegExp, label: string): Check => ({ name: `answer ${label}`, pass: (r) => pattern.test(r.text) });
const mentionsAll = (words: string[]): Check => ({
  name: `answer mentions ${words.join(", ")}`,
  pass: (r) => words.every((w) => r.text.toLowerCase().includes(w.toLowerCase())),
});
const newsFilteredSince = (date: string): Check => ({
  name: `news searches filtered since ${date}`,
  pass: (r) => r.searches.some((s) => s.startDate === date),
});
const fasterThan = (seconds: number): Check => ({ name: `finished in < ${seconds}s`, pass: (r) => r.totalMs < seconds * 1000 });
const noErrors: Check = { name: "no errors", pass: (r) => r.errors.length === 0 };
const cites: Check = { name: "cites sources", pass: (r) => r.sources > 0 && /\[\d+\]|【\d+/.test(r.text) };

const NO_RECORD = /no record|don['’]t have (any )?(record|memory)|can['’]?not find|couldn['’]t find|no (prior|previous|earlier) (conversation|question)/i;

// ---- scenarios ----
// Times: IST = UTC+5:30. "Thursday" = 12 Nov 2026.

const scenarios: Scenario[] = [
  {
    id: "crm-monday-thursday",
    description: "Challenge Q1: shortlist on Monday, ask what changed on Thursday",
    turns: [
      {
        at: "2026-11-09T05:30:00Z", // Mon 11:00 IST
        timeZone: "Asia/Kolkata",
        message: "We're choosing a CRM for our 20-person sales team. Shortlist the 5 best options with their current per-seat pricing.",
        checks: [searched(3), cites, noErrors],
      },
      {
        at: "2026-11-12T10:00:00Z", // Thu 15:30 IST
        timeZone: "Asia/Kolkata",
        message: "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?",
        checks: [
          memory((n) => n >= 1, "≥1"),
          searched(5),
          newsFilteredSince("2026-11-09"),
          says(/pric/i, "addresses pricing"),
          cites,
          noErrors,
          fasterThan(30),
        ],
      },
    ],
  },
  {
    id: "nov3-recall",
    description: "Challenge Q2: recall a specific date and re-verify the answer",
    turns: [
      {
        at: "2026-11-03T06:00:00Z", // Tue 3 Nov 11:30 IST
        timeZone: "Asia/Kolkata",
        message: "What does Neon charge for its Launch plan?",
        checks: [searched(1), cites, noErrors],
      },
      {
        at: "2026-11-12T10:00:00Z",
        timeZone: "Asia/Kolkata",
        message: "What did I ask you on 3 November? Is your answer still correct today?",
        checks: [memory(1), mentionsAll(["Neon", "Launch"]), searched(1), cites, noErrors, fasterThan(30)],
      },
    ],
  },
  {
    id: "no-record",
    description: "Challenge Q3 with no matching history: must not invent a past conversation",
    turns: [
      {
        at: "2026-11-12T10:00:00Z",
        timeZone: "Asia/Kolkata",
        message: "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?",
        checks: [memory(0), says(NO_RECORD, "says it has no record"), noErrors],
      },
    ],
  },
  {
    id: "timezone-yesterday",
    description: '"Yesterday" is the user\'s calendar day, not the server\'s or UTC',
    turns: [
      {
        at: "2026-11-11T22:00:00Z", // 14:00 on 11 Nov in Los Angeles (already 12 Nov in India)
        timeZone: "America/Los_Angeles",
        message: "Quick one: what's the capital of Australia?",
        checks: [didNotSearch, says(/canberra/i, "says Canberra"), noErrors],
      },
      {
        at: "2026-11-12T19:00:00Z", // 11:00 on 12 Nov in Los Angeles
        timeZone: "America/Los_Angeles",
        message: "What did I ask you yesterday?",
        checks: [memory(1), mentionsAll(["Australia"]), didNotSearch, noErrors],
      },
    ],
  },
  {
    id: "world-question-with-date",
    description: "A date in a question about the world must not trigger memory",
    turns: [
      {
        at: "2026-11-12T10:00:00Z",
        timeZone: "Asia/Kolkata",
        message: "Has Supabase announced anything since Monday?",
        checks: [memorySkipped, searched(1), newsFilteredSince("2026-11-09"), cites, noErrors],
      },
    ],
  },
  {
    id: "small-talk",
    description: "Small talk is answered directly and fast",
    turns: [
      {
        at: "2026-11-12T10:00:00Z",
        timeZone: "Asia/Kolkata",
        message: "hey, how's it going?",
        checks: [didNotSearch, memorySkipped, fasterThan(3), noErrors],
      },
    ],
  },
];

// ---- runner ----

async function runTurn(turn: Turn): Promise<TurnResult> {
  setNow(new Date(turn.at));
  const r: TurnResult = { text: "", memoryFound: null, searches: [], sources: 0, errors: [], firstTokenMs: null, totalMs: 0 };
  const start = performance.now();
  // A new conversation per turn: "On Monday…" is asked days later, in a fresh chat.
  for await (const e of chatTurn({ message: turn.message, timeZone: turn.timeZone }) as AsyncGenerator<AgentEvent>) {
    if (e.type === "text") {
      r.firstTokenMs ??= performance.now() - start;
      r.text += e.delta;
    }
    if (e.type === "memory") r.memoryFound = e.found;
    if (e.type === "search") r.searches.push({ queries: e.queries, startDate: e.startDate });
    if (e.type === "sources") r.sources += e.sources.length;
    if (e.type === "error") r.errors.push(e.message);
  }
  r.totalMs = performance.now() - start;
  await waitForClaims(); // the next simulated day must see this turn's claims
  return r;
}

// Groq's free tier allows ~8K tokens/minute; a search turn uses ~6-7K. Pausing after
// search turns keeps one turn's rate limit from distorting the next turn's latency.
const PAUSE_AFTER_SEARCH_MS = Number(process.env.EVAL_PAUSE_MS ?? 45_000);

const filters = process.argv.slice(2);
const selected = scenarios.filter((s) => !filters.length || filters.some((f) => s.id.includes(f)));
const report: string[] = [];
let passed = 0;
let total = 0;
const sec = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)}s`);

for (const scenario of selected) {
  console.log(`\n▶ ${scenario.id} — ${scenario.description}`);
  report.push(`\n### ${scenario.id}\n${scenario.description}\n`);
  for (const [i, turn] of scenario.turns.entries()) {
    const r = await runTurn(turn);
    const header = `Turn ${i + 1} (${turn.at}, ${turn.timeZone}): "${turn.message}"`;
    const timing = `first token ${sec(r.firstTokenMs)}, total ${sec(r.totalMs)}, memory ${r.memoryFound ?? "skipped"}, queries ${r.searches.flatMap((s) => s.queries).length}`;
    console.log(`  ${header}\n    ${timing}`);
    report.push(`**${header}**  \n${timing}\n`);
    for (const check of turn.checks) {
      const ok = check.pass(r);
      total++;
      if (ok) passed++;
      console.log(`    ${ok ? "✅" : "❌"} ${check.name}`);
      report.push(`- ${ok ? "✅" : "❌"} ${check.name}`);
    }
    if (r.errors.length) console.log(`    errors: ${r.errors.join(" | ")}`);
    const preview = r.text.replace(/\s+/g, " ").slice(0, 220);
    console.log(`    ↳ ${preview}${r.text.length > 220 ? "…" : ""}`);
    report.push(`\n> ${preview}${r.text.length > 220 ? "…" : ""}\n`);
    if (r.searches.length) await new Promise((res) => setTimeout(res, PAUSE_AFTER_SEARCH_MS));
  }
}

const claims = (db.prepare("SELECT COUNT(*) AS n FROM claims").get() as { n: number }).n;
const summary = `${passed}/${total} checks passed across ${selected.length} scenario(s); ${claims} claims extracted.`;
console.log(`\n${summary}`);

if (!filters.length) {
  fs.mkdirSync("evals/results", { recursive: true });
  fs.writeFileSync(
    "evals/results/latest.md",
    `# Eval results\n\nRun: ${new Date().toISOString()} · model: ${process.env.GROQ_MODEL ?? "openai/gpt-oss-120b"}\n\n**${summary}**\n${report.join("\n")}\n`,
  );
  console.log("Saved evals/results/latest.md");
}
process.exit(passed === total ? 0 : 1);
