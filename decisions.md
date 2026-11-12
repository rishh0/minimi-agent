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
