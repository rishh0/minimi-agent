import { getMessages } from "@/lib/memory/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return Response.json(getMessages(id));
}
