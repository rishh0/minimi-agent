import { test } from "node:test";
import assert from "node:assert/strict";
import { isEvergreenQuery, normalizeArgs } from "./webSearch.ts";

test("pricing/plan queries never get a date filter", () => {
  assert.ok(isEvergreenQuery("Pipedrive pricing"));
  assert.ok(isEvergreenQuery("HubSpot Sales Hub per-seat cost 2026"));
  assert.ok(isEvergreenQuery("Neon free tier limits"));
  assert.ok(!isEvergreenQuery("Salesforce announcement November 2026"));
  assert.ok(!isEvergreenQuery("Zoho CRM new feature release"));
});

test("normalizeArgs trims, de-duplicates and caps queries", () => {
  const raw = [" a1 ", "a1", ...Array.from({ length: 11 }, (_, i) => `q${i}`), "x"];
  const args = normalizeArgs({ queries: raw, start_date: "2026-11-09" });
  assert.equal(args?.queries.length, 10);
  assert.equal(args?.queries[0], "a1");
});

test("normalizeArgs drops malformed dates and empty query lists", () => {
  assert.equal(normalizeArgs({ queries: ["neon pricing"], start_date: "last monday" })?.start_date, undefined);
  assert.equal(normalizeArgs({ queries: ["", " "] }), null);
});
