// Smoke test: are both API keys valid, and how fast is each provider?
// Run: npm run check-keys
import Groq from "groq-sdk";

async function checkTavily() {
  const start = performance.now();
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({ query: "Supabase pricing", max_results: 3 }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const ms = Math.round(performance.now() - start);
  console.log(`✅ Tavily OK (${ms} ms) — top result: ${data.results[0]?.title}`);
}

async function checkGroq() {
  const start = performance.now();
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const res = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
    messages: [{ role: "user", content: "Reply with exactly: pong" }],
  });
  const ms = Math.round(performance.now() - start);
  console.log(`✅ Groq OK (${ms} ms) — model said: ${res.choices[0].message.content}`);
}

// Run both checks in parallel: total time ≈ the slower one, not the sum.
const results = await Promise.allSettled([checkTavily(), checkGroq()]);
for (const r of results) if (r.status === "rejected") console.error("❌", r.reason.message);
