import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCitations } from "./citations.ts";

test("gpt-oss citation markers become [n]; other markers are dropped", () => {
  assert.equal(normalizeCitations("a 【1†L1-L4】【3†L5】 b"), "a [1][3] b");
  assert.equal(normalizeCitations("price $39【6】."), "price $39[6].");
  assert.equal(normalizeCitations("You asked X.【Memory】"), "You asked X.");
  assert.equal(normalizeCitations("plain [2] stays"), "plain [2] stays");
});
