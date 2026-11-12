import type Groq from "groq-sdk";
import { groq, MODEL } from "@/lib/llm/groq";
import { normalizeArgs, webSearch, webSearchArgs, webSearchTool, type Source, type WebSearchArgs } from "@/lib/tools/webSearch";
import { SYSTEM_PROMPT } from "./prompt";
import type { AgentEvent, ChatMessage } from "./events";

type Message = Groq.Chat.ChatCompletionMessageParam;
type ToolCall = { id: string; name: string; arguments: string };

// Each search round costs ~1.5-3s, so an agent that keeps searching is slow, not thorough.
// After MAX_SEARCH_ROUNDS, further tool calls get "limit reached" as their result
// (the tool is never removed: gpt-oss calls it anyway and Groq turns that into an error).
const MAX_SEARCH_ROUNDS = 2;
const MAX_MODEL_CALLS = 4; // hard stop, so a model that keeps asking can't loop forever

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
    for (let modelCall = 0; modelCall < MAX_MODEL_CALLS; modelCall++) {
      const stream = await groq.chat.completions.create({
        model: MODEL,
        stream: true,
        messages,
        tools: [webSearchTool],
        tool_choice: "auto",
        temperature: 0.3,
      });

      // Text streams straight to the user. Tool calls arrive in fragments
      // (by index) and must be stitched together before we can parse them.
      const toolCalls: ToolCall[] = [];
      let text = "";
      for await (const chunk of stream) {
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

      const budgetLeft = searchRounds < MAX_SEARCH_ROUNDS;
      for (const call of toolCalls) {
        const parsed = parseToolCall(call);
        if (!parsed.ok || !budgetLeft) {
          const content = parsed.ok
            ? "Search limit reached. Do not search again: answer now from the results above, and say what you could not verify."
            : parsed.error;
          messages.push({ role: "tool", tool_call_id: call.id, content });
          continue;
        }
        const filter = parsed.args.start_date
          ? ` (since ${parsed.args.start_date})`
          : parsed.args.time_range
            ? ` (past ${parsed.args.time_range})`
            : "";
        // Tell the user what we're doing *before* the slow part starts.
        yield { type: "status", message: `🔎 Searching${filter}: ${parsed.args.queries.join(" · ")}` };
        const { text: results, sources } = await webSearch(parsed.args, allSources.length);
        allSources.push(...sources);
        if (sources.length) yield { type: "sources", sources };
        messages.push({ role: "tool", tool_call_id: call.id, content: results });
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
