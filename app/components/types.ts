import type { TurnMeta } from "@/lib/memory/store";
import type { Source } from "@/lib/tools/webSearch";

// A message as the UI shows it. Only role + content ever go back to the server.
export type UIMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sources: Source[];
  meta: TurnMeta;
  status?: string; // live progress while the answer is being produced
  error?: string;
  stopped?: boolean;
};

export const emptyMeta = (): TurnMeta => ({ searches: [], notes: [] });
