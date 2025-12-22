import test from "node:test";
import assert from "node:assert/strict";

import { dayIdFromLocalDate, pickIndex, pickUniqueIndices } from "../src/core/dailyWord.js";

test("dayIdFromLocalDate: 1970-01-01 => 0", () => {
  const d = new Date(Date.UTC(1970, 0, 1));
  assert.equal(dayIdFromLocalDate(d), 0);
});

test("pickIndex: uses dayId % length and seed", () => {
  assert.equal(pickIndex({ dayId: 11, seed: 0, length: 10 }), 1);
  assert.equal(pickIndex({ dayId: 11, seed: 3, length: 10 }), 4);
});

test("pickIndex: negative seed works (positive mod)", () => {
  assert.equal(pickIndex({ dayId: 1, seed: -1, length: 10 }), 0);
  assert.equal(pickIndex({ dayId: 0, seed: -1, length: 10 }), 9);
});

test("pickUniqueIndices: deterministic and unique", () => {
  const idx = pickUniqueIndices({ count: 4, dayId: 1234, seed: 7, length: 20, stride: 3 });
  assert.equal(idx.length, 4);
  assert.equal(new Set(idx).size, 4);
  assert.deepEqual(idx, pickUniqueIndices({ count: 4, dayId: 1234, seed: 7, length: 20, stride: 3 }));
});
