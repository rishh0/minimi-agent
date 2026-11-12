import { listConversations } from "@/lib/memory/store";

export async function GET() {
  return Response.json(listConversations());
}
