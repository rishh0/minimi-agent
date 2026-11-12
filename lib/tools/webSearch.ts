import { z } from "zod";

// The schema the model sees is deliberately LENIENT (no max counts, no regex):
// Groq validates tool calls server-side and fails the whole request on a mismatch.
// So we accept what the model sends and normalize it in code instead.
export const webSearchArgs = z.object({
  queries: z
    .array(z.string())
    .describe("Up to 3 distinct search queries. They run in parallel, so split multi-part questions."),
  time_range: z
    .string()
    .optional()
    .describe('"day", "week", "month" or "year". Only results published within this window. For news only — not for pricing or docs pages.'),
  start_date: z
    .string()
    .optional()
    .describe("YYYY-MM-DD. Only results published after this date. For news/announcements only — not for pricing or docs pages."),
});

export type WebSearchArgs = { queries: string[]; time_range?: "day" | "week" | "month" | "year"; start_date?: string };

const MAX_QUERIES = 3;

// Model output → safe arguments: trim/dedupe queries, keep the first 3, drop invalid filters.
export function normalizeArgs(raw: z.infer<typeof webSearchArgs>): WebSearchArgs | null {
  const queries = [...new Set(raw.queries.map((q) => q.trim()).filter((q) => q.length >= 2))].slice(0, MAX_QUERIES);
  if (!queries.length) return null;
  const time_range = (["day", "week", "month", "year"] as const).find((r) => r === raw.time_range);
  const start_date = raw.start_date && /^\d{4}-\d{2}-\d{2}$/.test(raw.start_date) ? raw.start_date : undefined;
  return { queries, time_range, start_date };
}

export const webSearchTool = {
  type: "function" as const,
  function: {
    name: "web_search",
    description:
      "Search the web for current information. Use for anything time-sensitive (prices, releases, news) or that you are not sure about.",
    parameters: z.toJSONSchema(webSearchArgs),
  },
};

export type Source = { id: number; title: string; url: string; published?: string };

type TavilyResult = { title: string; url: string; content: string; published_date?: string | null };

// Keep results small: Groq's free tier allows ~8K tokens/minute, and every
// token of search results is re-sent to the model on the next call.
const MAX_RESULTS_PER_QUERY = 4;
const MAX_CHARS_PER_RESULT = 600;

async function tavilySearch(query: string, args: WebSearchArgs): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      max_results: MAX_RESULTS_PER_QUERY,
      chunks_per_source: 1,
      include_published_date: true,
      time_range: args.time_range,
      start_date: args.start_date,
    }),
    signal: AbortSignal.timeout(10_000), // a hung search must not hang the chat
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const data = (await res.json()) as { results: TavilyResult[] };
  return data.results;
}

// Runs all queries in parallel, de-duplicates URLs, and numbers sources [1], [2]...
// so the model can cite them and the UI can link them.
// `idOffset` keeps citation numbers unique across multiple search rounds.
export async function webSearch(args: WebSearchArgs, idOffset = 0): Promise<{ text: string; sources: Source[] }> {
  const settled = await Promise.allSettled(args.queries.map((q) => tavilySearch(q, args)));

  const sources: Source[] = [];
  const blocks: string[] = [];
  const seen = new Set<string>();

  settled.forEach((outcome, i) => {
    const query = args.queries[i];
    if (outcome.status === "rejected") {
      blocks.push(`Query "${query}" failed: ${outcome.reason?.message ?? "unknown error"}`);
      return;
    }
    for (const r of outcome.value) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      const source: Source = { id: idOffset + sources.length + 1, title: r.title, url: r.url, published: r.published_date ?? undefined };
      sources.push(source);
      blocks.push(
        `[${source.id}] ${r.title}\nURL: ${r.url}\nPublished: ${source.published ?? "unknown"}\n${r.content.slice(0, MAX_CHARS_PER_RESULT)}`,
      );
    }
  });

  return { text: blocks.join("\n\n") || "No results found.", sources };
}
