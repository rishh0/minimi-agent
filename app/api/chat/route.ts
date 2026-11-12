import { runAgent } from "@/lib/agent/run";
import type { ChatMessage } from "@/lib/agent/events";

const encoder = new TextEncoder();

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: ChatMessage[] };
  const events = runAgent(messages);

  // Pull-based stream: we only produce the next event when the browser is ready for it.
  const stream = new ReadableStream({
    async pull(controller) {
      const { value, done } = await events.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
