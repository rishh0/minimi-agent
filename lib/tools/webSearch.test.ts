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
  const args = normalizeArgs({ queries: [" a1 ", "a1", "b2", "c3", "d4", "e5", "f6", "x"], start_date: "2026-11-09" });
  assert.deepEqual(args, { queries: ["a1", "b2", "c3", "d4", "e5"], start_date: "2026-11-09" });
});

test("normalizeArgs drops malformed dates and empty query lists", () => {
  assert.equal(normalizeArgs({ queries: ["neon pricing"], start_date: "last monday" })?.start_date, undefined);
  assert.equal(normalizeArgs({ queries: ["", " "] }), null);
});
