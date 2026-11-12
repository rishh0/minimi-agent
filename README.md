# Minimi Agent

A chat agent with one tool, web search, that **remembers past conversations, understands dates in your timezone, and can re-check its own earlier answers**.

> "On Monday we shortlisted 5 CRM tools… has any of them changed pricing since?"
> → finds Monday's conversation, re-verifies each price and checks for news since Monday, then answers with a comparison table and citations.

Design rationale: **[DESIGN.md](DESIGN.md)** · Full decision log: [decisions.md](decisions.md)

## Run it

Requires Node.js 22+.

```bash
npm install
cp .env.example .env.local   # add GROQ_API_KEY and TAVILY_API_KEY
npm run dev                  # http://localhost:3000
```

Keys: [Groq](https://console.groq.com/keys) (LLM) and [Tavily](https://app.tavily.com) (search). Both have free tiers. Conversations are stored in `data/minimi.db` (SQLite, created automatically).

### Try the memory features straight away (optional)

A fresh install has no history, so *"Last Tuesday I asked you about Postgres hosting…"* is correctly answered with "I have no record of that". To create realistic past conversations on the right days (last Monday: CRM shortlist; last Tuesday: Postgres hosting; 3 November: Neon pricing):

```bash
npm run seed-demo   # ~2 min, real API calls, run with the clock set back
```

Then ask:
- *On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?*
- *What did I ask you on 3 November? Is your answer still correct today?*
- *Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?*

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | App + API on :3000 |
| `npm test` | Unit tests: date resolution (under multiple server timezones), memory cues, tool argument handling |
| `npm run eval` | Multi-day scenario evals with a fake clock and an in-memory DB (real API calls, ~6 min) → `evals/results/latest.md` |
| `npm run seed-demo` | Optional demo history (see above) |
| `npm run check-keys` | Verifies both API keys and prints their latency |
| `npm run backfill-claims` | Extracts claims for answers saved before claim tracking existed |

Optional env vars (in `.env.example`): `NOW` starts the server at a past moment (e.g. `NOW=2026-11-09T05:30:00Z npm run dev`), `LOG_TIMINGS=1` prints per-call latency and token usage, and `CLAIMS_MODEL` sets the extraction model.

## Layout

```
app/                  Next.js shell: chat UI, /api/chat (NDJSON stream), conversation list
lib/agent/            chat.ts (one turn: dates → memory → agent → save), run.ts (model ⇄ search loop), prompt.ts
lib/time/             clock.ts (fakeable "now"), resolve.ts (date phrases → ranges in the user's timezone)
lib/memory/           SQLite schema, storage, retrieval (FTS5 + date ranges)
lib/claims/           background extraction of checkable facts from answers
lib/tools/            web_search (Tavily): parallel queries, result budget, normalisation
evals/                scenario evals
```
