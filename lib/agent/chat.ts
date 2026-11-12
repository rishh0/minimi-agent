import { runAgent } from "./run";
import { normalizeCitations } from "./citations";
import type { AgentEvent } from "./events";
import { addMessage, conversationExists, createConversation, getMessages } from "@/lib/memory/store";
import type { Source } from "@/lib/tools/webSearch";
import { now } from "@/lib/time/clock";
import { formatNow, resolveDates } from "@/lib/time/resolve";
import { memoryNote, timeContext } from "./prompt";
import { retrieveMemory } from "@/lib/memory/retrieve";
import { recordClaimsInBackground } from "@/lib/claims/extract";

// Only the most recent turns go to the model: long chats would blow through
// Groq's ~8K tokens/minute free tier and slow every request down.
const MAX_HISTORY_MESSAGES = 12;

// One chat turn, end to end: persist the user message → load history → run the
// agent → persist the answer. This is the pipeline later steps plug into
// (date resolution and memory retrieval go before runAgent).
export async function* chatTurn(input: {
  conversationId?: string;
  message: string;
  timeZone: string;
}): AsyncGenerator<AgentEvent> {
  const conversationId =
    input.conversationId && conversationExists(input.conversationId)
      ? input.conversationId
      : createConversation(input.message);
  yield { type: "conversation", id: conversationId };

  addMessage(conversationId, "user", input.message);
  // Older answers are clipped: they're long (tables, citations) and get re-sent on every
  // model call. Their facts survive as claims; the latest answer stays whole for follow-ups.
  const recent = getMessages(conversationId).slice(-MAX_HISTORY_MESSAGES);
  const lastAnswer = recent.findLastIndex((m) => m.role === "assistant");
  const history = recent.map(({ role, content }, i) => ({
    role,
    content: role === "assistant" && i !== lastAnswer && content.length > 800 ? content.slice(0, 800) + "…" : content,
  }));

  // Step 1 of the pipeline: resolve "last Tuesday" etc. in the user's timezone.
  const at = now();
  const dateRefs = resolveDates(input.message, at, input.timeZone);
  const notes = [timeContext(formatNow(at, input.timeZone), input.timeZone, dateRefs)];

  // Step 2: if the user is asking about past conversations, look them up (SQL, ~1ms).
  const memory = retrieveMemory({ message: input.message, dateRefs, excludeConversationId: conversationId });
  if (memory) {
    yield { type: "memory", found: memory.turns.length };
    yield { type: "status", message: `📚 Checked memory: ${memory.turns.length} past question(s) found` };
    notes.push(memoryNote(memory, input.timeZone));
  }
  const contextNote = notes.join("\n\n");

  let answer = "";
  const sources: Source[] = [];
  for await (const event of runAgent(history, contextNote)) {
    if (event.type === "text") answer += event.delta;
    if (event.type === "sources") sources.push(...event.sources);
    if (event.type === "done") continue; // we send "done" ourselves, after saving
    yield event;
  }

  // Save before "done", so a fast follow-up question always sees this answer.
  if (answer) {
    const text = normalizeCitations(answer);
    const messageId = addMessage(conversationId, "assistant", text, sources);
    // Only researched answers have checkable facts worth tracking.
    if (sources.length) recordClaimsInBackground(messageId, text, sources, now().toISOString());
  }
  yield { type: "done" };
}
