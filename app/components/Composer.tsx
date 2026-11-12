"use client";

import { useEffect, useRef, useState } from "react";

// Enter sends, Shift+Enter adds a line; the box grows with its content.
// While an answer streams, the button becomes Stop.
export function Composer({ busy, onSend, onStop }: { busy: boolean; onSend: (text: string) => void; onStop: () => void }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  useEffect(() => {
    if (!busy) ref.current?.focus();
  }, [busy]);

  function submit() {
    const value = text.trim();
    if (!value || busy) return;
    onSend(value);
    setText("");
  }

  return (
    <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white p-2 shadow-sm focus-within:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
      <textarea
        ref={ref}
        rows={1}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask anything, or about something we discussed before…"
        className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-1.5 outline-none placeholder:text-zinc-400"
      />
      {busy ? (
        <button
          onClick={onStop}
          aria-label="Stop"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          <span className="size-3 rounded-sm bg-current" />
        </button>
      ) : (
        <button
          onClick={submit}
          disabled={!text.trim()}
          aria-label="Send"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-lg text-white transition disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900"
        >
          ↑
        </button>
      )}
    </div>
  );
}
