import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeCitations } from "@/lib/agent/citations";
import type { Source } from "@/lib/tools/webSearch";

// Renders an answer as Markdown (GFM tables, bold, lists) and turns [3] citations
// into links to the matching source. Works on partial text while it streams.
export function Markdown({ text, sources = [] }: { text: string; sources?: Source[] }) {
  const urls = new Map(sources.map((s) => [s.id, s.url]));
  const linked = normalizeCitations(text).replace(/\[(\d+)\](?!\()/g, (match, n) => {
    const url = urls.get(Number(n));
    return url ? `[[${n}]](${url})` : match;
  });
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {linked}
      </ReactMarkdown>
    </div>
  );
}
