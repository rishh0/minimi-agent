// First screen: shows what the agent is for and lets a new user try it in one click.
const EXAMPLES = [
  {
    label: "Re-check a past shortlist",
    text: "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?",
  },
  { label: "Recall a date", text: "What did I ask you on 3 November? Is your answer still correct today?" },
  {
    label: "Follow up on an old question",
    text: "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?",
  },
  { label: "Ask about the world", text: "What has Supabase announced this week?" },
];

export function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center pt-16 text-center sm:pt-24">
      <h1 className="text-2xl font-semibold tracking-tight">What should I look into?</h1>
      <p className="mt-2 text-sm text-zinc-500">
        I search the web, remember our past conversations, and re-check what I told you before.
      </p>
      <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
        {EXAMPLES.map((e) => (
          <button
            key={e.label}
            onClick={() => onPick(e.text)}
            className="rounded-xl border border-zinc-200 p-3 text-left transition hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
          >
            <span className="block text-sm font-medium">{e.label}</span>
            <span className="mt-1 line-clamp-2 block text-xs text-zinc-500">{e.text}</span>
          </button>
        ))}
      </div>
      <p className="mt-6 text-xs text-zinc-500">
        New install? Run <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">npm run seed-demo</code> to create
        the past conversations these examples refer to.
      </p>
    </div>
  );
}
