# DESIGN

## The problem behind the examples

Every example question — *"On Monday we shortlisted…"*, *"What did I ask you on 3 November?"*, *"Last Tuesday I asked about Postgres hosting…"* — needs three things a plain search chatbot doesn't have: **memory across conversations**, **exact dates**, and **re-checking its own past answers**. I built the architecture around those, with web search as the one tool that serves them.

## How it works

```
message + browser timezone
  │
  ├─ 1. Resolve dates (code)      "last Tuesday" → 2026-11-10, local midnight → UTC range
  ├─ 2. Retrieve memory (code)    only if the message is about the past ("I asked", "we shortlisted")
  │                               SQLite: FTS5 keywords within the date range → whole range → all history
  │                               → past Q&A + structured claims, or an explicit "NOTHING FOUND"
  ├─ 3. Agent loop                model ⇄ web_search (Tavily); up to 10 parallel queries per turn
  ├─ 4. Stream to the browser     NDJSON events: status, sources, text, done
  └─ 5. Save + extract claims     answer saved, then a small model extracts
                                  {entity, attribute, value, source} in the background
```

A turn is one async generator (`lib/agent/chat.ts`) yielding typed events. Next.js is only the HTTP/UI shell; the eval suite drives the same generator directly with a fake clock.

## Why it's built this way

- **Memory and dates are code, not model behaviour.** LLMs are unreliable at calendar arithmetic, and these values become SQL queries. `chrono-node` plus small rules ("since X" → X..today, "last week" → Mon–Sun) resolves dates in the user's timezone; tests run under four server timezones. Retrieval runs *before* the model: it keeps the single tool, saves a model round-trip, and a date lookup is deterministic.
- **Claims make "still correct?" a checklist.** Re-reading old prose is vague; re-verifying `Pipedrive | Growth per-seat price | $39` against today's sources is not. The prompt forbids calling a different number "unchanged" — if the old figure was wrong, the agent says so.
- **"No record" is a fact, not a hope.** When retrieval finds nothing, the model is told so explicitly. It never invents a past conversation.
- **Rules that matter are enforced in code.** The model repeatedly ignored "don't date-filter pricing searches", hiding the pages it needed (4 of 5 CRMs unverified). Code now never date-filters pricing/plan queries (5 of 5 verified). Tool arguments are normalised in code, and schemas are lenient because Groq rejects whole requests on schema mismatches.
- **Fast by measurement.** Groq (`gpt-oss-120b`, ~500 tok/s) for the answers. Profiling showed the slow part wasn't the model but rate-limit waits: a turn used ~16K tokens against a free-tier 8K/minute. A per-turn query budget (one parallel round), a fixed result-size budget, low reasoning effort for planning only (low everywhere caused date errors), and clipped history took a 5-product re-check from **65s to 7s**. Small talk skips search (~0.5s).

## Considered and rejected

| Option | Why not |
|---|---|
| LangChain / LangGraph | Linear pipeline with one tool loop; a framework would hide the prompts and latency I needed to control. |
| Vector DB / embeddings | Memory queries are dates and keywords — exact SQL, not similarity. |
| Postgres / Prisma | The grader would have to run a DB server; Prisma lacks FTS5. SQLite is a file. |
| Memory as a second tool | Breaks the one-tool brief and costs an extra model call. |
| Groq's built-in browser search | No control over date filters, result size, or caching. |
| LLM-resolved dates | Wrong often enough to break retrieval. |
| Deploying | The brief runs locally; SQLite doesn't persist on serverless. Only `lib/memory/` would change. |

## Evidence

`npm test` — unit tests for date resolution, memory cues, tool normalisation.
`npm run eval` — six multi-day scenarios (the three example questions, no-record, timezone, small talk) with a fake clock and an in-memory DB; latest run in `evals/results/latest.md`.

## With another week

1. **Proactive change monitoring:** re-verify stored claims on a schedule and tell the user what changed before they ask.
2. **Read the source of truth:** fetch vendors' official pricing pages instead of trusting third-party summaries, and prefer them when sources disagree.
3. **LLM-judged evals:** grade answer correctness against a fixed rubric, and run each scenario several times to measure variance.
4. **Smarter memory gating:** a small classifier instead of regex cues, plus entity search over claims ("what did you tell me about HubSpot?").
5. **Production plumbing:** a job queue for claim extraction, per-user memory with auth, and Postgres with the same retrieval interface.
