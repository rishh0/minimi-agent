import type Groq from "groq-sdk";
import { groq, MODEL } from "@/lib/llm/groq";
import { isEvergreenQuery, normalizeArgs, webSearch, webSearchArgs, webSearchTool, type Source, type WebSearchArgs } from "@/lib/tools/webSearch";
import { SYSTEM_PROMPT } from "./prompt";
import type { AgentEvent, ChatMessage } from "./events";

type Message = Groq.Chat.ChatCompletionMessageParam;
type ToolCall = { id: string; name: string; arguments: string };

// Search budget per turn. Every extra round costs ~2-3s of search plus a full model call
// (~5K tokens — over Groq's free tier of 8K/min that means a rate-limit wait).
// So the limit is on queries, not rounds: one round of 10 parallel queries is the
// whole budget; small rounds leave room for a follow-up. Over-budget calls get
// "limit reached" as their result (the tool is never removed: gpt-oss calls it
// anyway and Groq turns that into an error).
const MAX_SEARCH_ROUNDS = 2;
const MAX_QUERIES_PER_TURN = 10;
const MAX_MODEL_CALLS = 4; // hard stop, so a model that keeps asking can't loop forever

// LOG_TIMINGS=1 prints where each turn's time goes (model calls vs searches).
const timing = (label: string, start: number) => {
  if (process.env.LOG_TIMINGS) console.log(`[timing] ${label}: ${Math.round(performance.now() - start)} ms`);
};

// The agent loop: call the model; if it asks for web_search, run it, feed the
// results back, and call again. Stops when the model answers in text.
// `contextNote` carries per-request facts (current time, resolved dates). It goes
// AFTER the history so the stable prefix (system prompt + history) stays cacheable.
export async function* runAgent(history: ChatMessage[], contextNote: string): AsyncGenerator<AgentEvent> {
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "system", content: contextNote },
  ];
  const allSources: Source[] = [];

  try {
    let searchRounds = 0;
    let queriesUsed = 0;
    for (let modelCall = 0; modelCall < MAX_MODEL_CALLS; modelCall++) {
      const callStart = performance.now();
      const stream = await groq.chat.completions.create({
        model: MODEL,
        stream: true,
        messages,
        tools: [webSearchTool],
        tool_choice: "auto",
        temperature: 0.3,
        // Spend reasoning where it matters. Planning searches is easy → "low" (cut ~800
        // reasoning tokens, which count toward the rate limit). Judging results — dates,
        // what actually changed — is where accuracy is decided → default effort.
        reasoning_effort: searchRounds === 0 ? "low" : "medium",
      });

      // Text streams straight to the user. Tool calls arrive in fragments
      // (by index) and must be stitched together before we can parse them.
      const toolCalls: ToolCall[] = [];
      let text = "";
      let firstChunk = true;
      for await (const chunk of stream) {
        if (firstChunk) timing(`model call ${modelCall + 1}: first chunk`, callStart);
        firstChunk = false;
        const usage = chunk.x_groq?.usage;
        if (usage && process.env.LOG_TIMINGS) {
          const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
          const reasoning = usage.completion_tokens_details?.reasoning_tokens ?? 0;
          console.log(`[tokens] call ${modelCall + 1}: prompt ${usage.prompt_tokens} (cached ${cached}), output ${usage.completion_tokens} (reasoning ${reasoning})`);
        }
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          text += delta.content;
          yield { type: "text", delta: delta.content };
        }
        for (const tc of delta?.tool_calls ?? []) {
          const call = (toolCalls[tc.index] ??= { id: "", name: "", arguments: "" });
          if (tc.id) call.id = tc.id;
          if (tc.function?.name) call.name += tc.function.name;
          if (tc.function?.arguments) call.arguments += tc.function.arguments;
        }
      }

      timing(`model call ${modelCall + 1}: complete`, callStart);
      if (toolCalls.length === 0) {
        yield { type: "done" }; // the model answered — we're done
        return;
      }

      messages.push({
        role: "assistant",
        content: text || null,
        tool_calls: toolCalls.map((c) => ({
          id: c.id,
          type: "function" as const,
          function: { name: c.name, arguments: c.arguments },
        })),
      });

      const budgetLeft = searchRounds < MAX_SEARCH_ROUNDS && queriesUsed < MAX_QUERIES_PER_TURN;
      for (const call of toolCalls) {
        const parsed = parseToolCall(call);
        if (!parsed.ok || !budgetLeft) {
          const content = parsed.ok
            ? "Search limit reached. Do not search again: answer now from the results above, and say what you could not verify."
            : parsed.error;
          messages.push({ role: "tool", tool_call_id: call.id, content });
          continue;
        }
        parsed.args.queries = parsed.args.queries.slice(0, MAX_QUERIES_PER_TURN - queriesUsed);
        queriesUsed += parsed.args.queries.length;
        // Tell the user what we're doing *before* the slow part starts.
        const since = parsed.args.start_date;
        const shown = parsed.args.queries.map((q) => (since && !isEvergreenQuery(q) ? `${q} (since ${since})` : q));
        yield { type: "status", message: `🔎 Searching: ${shown.join(" · ")}` };
        const searchStart = performance.now();
        const { text: results, sources } = await webSearch(parsed.args, allSources.length);
        timing(`search (${parsed.args.queries.length} queries)`, searchStart);
        allSources.push(...sources);
        if (sources.length) yield { type: "sources", sources };
        // On the last allowed round, say so in the results — otherwise the model often
        // asks for another search, which costs a whole extra model call (~5K tokens).
        const last = searchRounds + 1 >= MAX_SEARCH_ROUNDS || queriesUsed >= MAX_QUERIES_PER_TURN;
        const note = last
          ? "\n\n(This was your final search. Answer now from these results; say what you could not verify.)"
          : "\n\n(Search again only if something essential is missing.)";
        messages.push({ role: "tool", tool_call_id: call.id, content: results + note });
      }
      if (budgetLeft) searchRounds++;
    }
    yield { type: "error", message: "I couldn't finish this answer. Please try rephrasing the question." };
    yield { type: "done" };
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

// Validates the model's arguments with Zod before running anything. Bad
// arguments go back to the model as an error message so it can correct itself.
function parseToolCall(call: ToolCall): { ok: true; args: WebSearchArgs } | { ok: false; error: string } {
  if (call.name !== "web_search") return { ok: false, error: `Error: unknown tool "${call.name}".` };
  let json: unknown;
  try {
    json = JSON.parse(call.arguments);
  } catch {
    return { ok: false, error: "Error: arguments were not valid JSON." };
  }
  const parsed = webSearchArgs.safeParse(json);
  if (!parsed.success) return { ok: false, error: `Error: invalid arguments: ${parsed.error.message}` };
  const args = normalizeArgs(parsed.data);
  if (!args) return { ok: false, error: "Error: provide at least one non-empty query." };
  return { ok: true, args };
}
