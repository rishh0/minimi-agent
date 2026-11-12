// Extracts claims for researched answers saved before claim tracking existed.
// Run: npm run backfill-claims
import { db } from "@/lib/memory/db";
import { extractClaims } from "@/lib/claims/extract";
import { saveClaims } from "@/lib/memory/store";

const rows = db
  .prepare(
    `SELECT m.id, m.content, m.sources, m.created_at FROM messages m
      WHERE m.role = 'assistant' AND m.sources IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM claims c WHERE c.message_id = m.id)`,
  )
  .all() as { id: number; content: string; sources: string; created_at: string }[];

console.log(`${rows.length} answer(s) without claims`);
for (const row of rows) {
  const claims = await extractClaims(row.content, JSON.parse(row.sources));
  // observed_at = when the answer was originally given, not now.
  saveClaims(row.id, claims, row.created_at);
  console.log(`\n#${row.id} (${row.created_at.slice(0, 10)}): ${claims.length} claim(s)`);
  for (const c of claims) console.log(`  ${c.entity} | ${c.attribute} | ${c.value}${c.sourceUrl ? "  ← " + c.sourceUrl : ""}`);
}
