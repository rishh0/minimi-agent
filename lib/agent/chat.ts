import { runAgent } from "./run";
import { normalizeCitations } from "./citations";
import type { AgentEvent } from "./events";
import { addMessage, conversationExists, createConversation, getMessages } from "@/lib/memory/store";
import type { Source } from "@/lib/tools/webSearch";
import { now } from "@/lib/time/clock";
import { formatNow, resolveDates } from "@/lib/time/resolve";
import { timeContext } from "./prompt";

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
  const history = getMessages(conversationId)
    .slice(-MAX_HISTORY_MESSAGES)
    .map(({ role, content }) => ({ role, content }));

  // Step 1 of the pipeline: resolve "last Tuesday" etc. in the user's timezone.
  const at = now();
  const dateRefs = resolveDates(input.message, at, input.timeZone);
  const contextNote = timeContext(formatNow(at, input.timeZone), input.timeZone, dateRefs);

  let answer = "";
  const sources: Source[] = [];
  for await (const event of runAgent(history, contextNote)) {
    if (event.type === "text") answer += event.delta;
    if (event.type === "sources") sources.push(...event.sources);
    if (event.type === "done") continue; // we send "done" ourselves, after saving
    yield event;
  }

  // Save before "done", so a fast follow-up question always sees this answer.
  if (answer) addMessage(conversationId, "assistant", normalizeCitations(answer), sources);
  yield { type: "done" };
}
