# Decisions log

One entry per decision: what we chose, what we rejected, why. This becomes DESIGN.md.

## 1. Next.js (App Router) as the single app
- **Chose:** one Next.js app — UI in `app/page.tsx`, API in `app/api/*/route.ts`.
- **Rejected:** separate Express backend + Vite/React frontend.
- **Why:** one `npm run dev` starts everything; no CORS; one deploy. All agent logic lives in `lib/` (framework-agnostic), so Next.js is only the HTTP shell.

## 2. Groq for the LLM, Tavily for search
- **Chose:** Groq (`openai/gpt-oss-120b`, ~500 tok/s) + Tavily search API.
- **Rejected:** Groq's built-in `browser_search` tool; paid frontier models.
- **Why:** speed is a judging criterion and Groq is the fastest inference available. Own search tool (not the built-in one) gives control over date filters (`start_date`, `time_range`), result size, and caching — and the agent loop stays provider-agnostic.
- **Constraint:** free tier ≈ 8K tokens/min → search results must be compact.

## 3. `web_search` takes a list of queries; our code runs them in parallel
- **Why:** gpt-oss-120b doesn't support parallel tool calls. One tool call with N queries + `Promise.all` gives parallelism regardless of model.

## 4. Hand-written agent loop, capped at 2 search rounds
- **Chose:** our own loop in `lib/agent/run.ts`: stream → stitch tool-call fragments → validate with Zod → search → feed results back → repeat; after round 2, `tool_choice: "none"` forces an answer.
- **Rejected:** LangChain/LangGraph agents; uncapped loops.
- **Why:** each search round costs ~1.5–3s. A cap keeps worst-case latency bounded. Writing the loop ourselves keeps every step visible and tunable.

## 5. Zod schema as the single source of truth for the tool
- One schema generates the JSON Schema the model sees (`z.toJSONSchema`) and validates the arguments it sends back. Invalid args are returned to the model as an error message instead of crashing.

## 6. Compact search results
- 4 results/query, 1 chunk/source, 600 chars max, de-duplicated by URL, numbered [1..n] for citations. Every token of results is re-sent to the model, and Groq's free tier is ~8K tokens/min.

## 7. SQLite (better-sqlite3) + FTS5 for memory
- **Chose:** a local SQLite file (`data/minimi.db`), raw SQL, FTS5 full-text index on messages.
- **Rejected:** Postgres (grader must run a DB server), Prisma (no FTS5 support, extra generate step), a vector DB (our queries are mostly "what did I ask on <date>" — a date range in SQL, not semantic similarity).
- **Why:** zero setup after `npm install`; dates and keywords are exact queries. better-sqlite3 v13 bundles prebuilt binaries for macOS/Linux/Windows, so its compile script is denied (`allowScripts`) — install never needs a C toolchain.

## 8. The server owns conversation history
- Browser sends only `{conversationId, message}`; the server loads history from SQLite. Single source of truth, survives refresh, and memory retrieval can later search *all* past conversations, not just the open one.
- Only the last 12 messages go to the model (token budget + latency).
- Single user, no auth — memory is shared across all conversations by design.

## 9. One clock for the whole app
- Every timestamp and every "today" goes through `lib/time/clock.ts`. `NOW=` shifts the clock for demos; `setNow()` pins it for evals. Without this, multi-day scenarios ("On Monday we…") are untestable.

## 10. Dates are resolved in code, in the user's timezone
- **Chose:** `chrono-node` + our own rules in `lib/time/resolve.ts` → exact ranges (`startDate`/`endDate` local, `startUtc`/`endUtc` for DB queries). The browser sends its IANA timezone; invalid → UTC.
- **Rejected:** letting the LLM do date math; using server time or UTC days.
- **Why:** "3 November" is the user's calendar day (in India it starts 18:30 UTC on 2 Nov). These ranges become database queries, so they must be exact.
- Rules on top of chrono: "since X" → X..today; "last week" → previous Mon–Sun; "between A and B" → one range.
- chrono applies its timezone option only to explicit dates, not relative ones ("yesterday") — caught by a unit test; fixed by passing a wall-clock reference date. Tests run under 4 server timezones.

## 11. Stable system prompt, volatile context last
- The system prompt contains nothing that changes per request. Time context (now + resolved dates) is a separate system message after the history, so the prefix stays identical and cacheable (Groq: cached tokens don't count toward rate limits).

## 12. Memory retrieval runs in code before the model (not a second tool)
- **Chose:** `lib/memory/retrieve.ts` — if the message has a memory cue ("I asked", "we shortlisted", "still correct"…), query SQLite: FTS keyword matches inside the resolved date range → else all questions in the range → else keyword matches across all history. Results go to the model as a "Memory" note; an empty result is stated explicitly ("NOTHING FOUND — say you have no record").
- **Rejected:** memory as a tool (brief allows one tool; costs a model round-trip; a date lookup is deterministic), always injecting memory (a date like "since Monday" in a world question would pull in irrelevant chats), embeddings/vector search (queries are dates + keywords).
- Current conversation is excluded (it's already in the history).

## 13. Never let a model mistake become a crash
- Groq validates tool calls server-side and fails the whole request on a schema mismatch (e.g. 5 queries when max is 3). → The schema the model sees is lenient; `normalizeArgs` clamps to 3 queries and drops malformed filters in code.
- `tool_choice: "none"` (and even removing tools) still made gpt-oss try to search → Groq error. → The tool always stays available; after 2 search rounds, extra calls get "limit reached, answer now" as their result. Hard stop at 4 model calls.

## 14. Claims: structured facts extracted from every researched answer
- **Chose:** after a researched answer is saved, a smaller model (`gpt-oss-20b`, strict JSON schema, low reasoning effort) extracts `{entity, attribute, value, source}` into a `claims` table, in the background (the user never waits). Memory notes show these facts, so "still correct?" re-checks each one.
- **Rejected:** re-reading the prose answer (imprecise, more tokens); extracting synchronously (adds ~1s before "done"); using the big model (overkill for extraction).
- `observed_at` = when we saw the value. Duplicates (same fact from two sources) are collapsed. `waitForClaims()` lets scripts/evals wait for background work.

## 15. Enforce search rules in code, not just in the prompt
- The model kept adding "past day" date filters to pricing searches despite three prompt instructions → pricing pages (old URL, current price) were filtered out → "not verified" for 4 of 5 CRMs.
- **Fix:** removed `time_range` (one filter, `start_date`, matching our resolved dates), and code never applies a date filter to pricing/plan/limit queries. Up to 5 queries per call, one product per query. Result: 5 of 5 CRMs verified.

## 16. tsx for scripts
- Scripts and evals import `lib/` through the `@/` path alias, which plain Node can't resolve; `tsx` reads tsconfig paths. Its esbuild dependency ships platform binaries, so esbuild's install script is denied too.
