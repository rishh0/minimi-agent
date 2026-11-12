import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDates } from "./resolve.ts";

// Thursday 12 Nov 2026, 15:30 in India.
const NOW = new Date("2026-11-12T10:00:00Z");
const IST = "Asia/Kolkata";
const range = (msg: string, tz = IST) => resolveDates(msg, NOW, tz).map((r) => [r.startDate, r.endDate]);

test("weekday references resolve to the most recent past day", () => {
  assert.deepEqual(range("On Monday we shortlisted 5 CRM tools"), [["2026-11-09", "2026-11-09"]]);
  assert.deepEqual(range("Last Tuesday I asked you about Postgres hosting"), [["2026-11-10", "2026-11-10"]]);
});

test("explicit dates", () => {
  assert.deepEqual(range("What did I ask you on 3 November?"), [["2026-11-03", "2026-11-03"]]);
});

test("'since X' runs through today", () => {
  assert.deepEqual(range("what changed since Monday?"), [["2026-11-09", "2026-11-12"]]);
});

test("'last week' is the whole previous Mon–Sun week", () => {
  assert.deepEqual(range("anything new from last week"), [["2026-11-02", "2026-11-08"]]);
});

test("'between A and B' is one range", () => {
  assert.deepEqual(range("between 1 Nov and 5 Nov"), [["2026-11-01", "2026-11-05"]]);
});

test("numbers that aren't dates are ignored", () => {
  assert.deepEqual(range("I have 5 tools and 20 people"), []);
});

test("day boundaries are in the user's timezone, not UTC", () => {
  const [ref] = resolveDates("on 3 November", NOW, IST);
  assert.equal(ref.startUtc, "2026-11-02T18:30:00.000Z"); // midnight IST
  assert.equal(ref.endUtc, "2026-11-03T18:30:00.000Z");
});

test("'yesterday' depends on the timezone", () => {
  // 2026-11-12T03:00Z is 08:30 on 12 Nov in India but 19:00 on 11 Nov in Los Angeles.
  const at = new Date("2026-11-12T03:00:00Z");
  assert.equal(resolveDates("yesterday", at, IST)[0].startDate, "2026-11-11");
  assert.equal(resolveDates("yesterday", at, "America/Los_Angeles")[0].startDate, "2026-11-10");
});
