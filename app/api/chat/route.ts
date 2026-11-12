import { z } from "zod";
import { chatTurn } from "@/lib/agent/chat";

const encoder = new TextEncoder();

const ChatRequest = z.object({
  conversationId: z.string().optional(),
  message: z.string().trim().min(1).max(4000),
});

export async function POST(req: Request) {
  const parsed = ChatRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const events = chatTurn(parsed.data);

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
