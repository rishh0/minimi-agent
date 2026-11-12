import { test } from "node:test";
import assert from "node:assert/strict";
import { isAboutMemory, keywordQuery } from "./keywords.ts";

test("memory cues: the challenge's example questions are about memory", () => {
  assert.ok(isAboutMemory("On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed?"));
  assert.ok(isAboutMemory("What did I ask you on 3 November? Is your answer still correct today?"));
  assert.ok(isAboutMemory("Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"));
});

test("memory cues: questions about the world are not", () => {
  assert.ok(!isAboutMemory("Has Supabase announced anything since Monday?"));
  assert.ok(!isAboutMemory("What does Neon charge for its Launch plan?"));
  assert.ok(!isAboutMemory("hi, whats up?"));
});

test("keyword query keeps topic words, drops dates and filler", () => {
  assert.equal(keywordQuery("Last Tuesday I asked you about Postgres hosting"), '"postgres" OR "hosting"');
  assert.equal(keywordQuery("What did I ask you on 3 November?"), null);
});
