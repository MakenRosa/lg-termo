import assert from "node:assert/strict";

import { dayIdFromLocalDate, pickDailyModeIndices, pickIndex, pickUniqueIndices } from "../src/core/dailyWord.js";
import { evaluateGuess } from "../src/core/evaluateGuess.js";
import { createNewGame, addLetter, applyGuess, submitGuess } from "../src/core/gameState.js";
import { hydrateGame, serializeGame } from "../src/core/persistence.js";
import { Modes } from "../src/core/modes.js";

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("evaluateGuess: repeated letters (secret 2x, guess 5x)", () => {
  const res = evaluateGuess("BANAL", "AAAAA");
  assert.deepEqual(res, ["absent", "correct", "absent", "correct", "absent"]);
});

test("evaluateGuess: repeated letters (secret 2x, guess 3x) respects counts", () => {
  const res = evaluateGuess("TERRA", "RARAR");
  assert.deepEqual(res, ["present", "present", "correct", "absent", "absent"]);
});

test("evaluateGuess: guess repeats when secret has 1 occurrence", () => {
  const res = evaluateGuess("LINHA", "AAAAA");
  assert.deepEqual(res, ["absent", "absent", "absent", "absent", "correct"]);
});

test("evaluateGuess: accents (secret has diacritics, guess is base)", () => {
  const res = evaluateGuess("\u00D3RG\u00C3O", "ORGAO");
  assert.deepEqual(res, ["correct", "correct", "correct", "correct", "correct"]);
});

test("submitGuess: invalid word does not consume attempt", () => {
  const state0 = createNewGame({ mode: Modes.termo, dayId: 1, secretsOriginal: ["TERRA"], seed: 0 });
  const state1 = { ...state0, currentGuess: "ABCDE" };
  const state2 = submitGuess(state1, { dictionarySet: new Set(["TERRA"]) });
  assert.equal(state2.guesses.length, 0);
  assert.equal(state2.currentGuess, "ABCDE");
  assert.equal(state2.lastMessage, "Palavra inv\u00E1lida.");
});

test("Dueto: one attempt applies to all boards", () => {
  const dict = new Set(["TERRA", "PLANO", "PONTO"]);
  const s0 = createNewGame({ mode: Modes.dueto, dayId: 1, secretsOriginal: ["TERRA", "PLANO"], seed: 0 });
  const s1 = { ...s0, currentGuess: "PONTO" };
  const s2 = submitGuess(s1, { dictionarySet: dict });
  assert.equal(s2.guesses.length, 1);
  assert.equal(s2.evaluations[0].length, 2);
});

test("Quarteto: one attempt applies to all boards", () => {
  const dict = new Set(["TERRA", "PLANO", "PONTO", "VENTO", "FELIZ"]);
  const s0 = createNewGame({
    mode: Modes.quarteto,
    dayId: 1,
    secretsOriginal: ["TERRA", "PLANO", "PONTO", "VENTO"],
    seed: 0,
  });
  const s1 = { ...s0, currentGuess: "FELIZ" };
  const s2 = submitGuess(s1, { dictionarySet: dict });
  assert.equal(s2.guesses.length, 1);
  assert.equal(s2.evaluations[0].length, 4);
});

test("dayIdFromLocalDate: 1970-01-01 => 0", () => {
  const d = new Date(1970, 0, 1);
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

test("pickDailyModeIndices: disjoint across modes", () => {
  const a = pickDailyModeIndices({ dayId: 1234, seed: 7, length: 200 });
  const b = pickDailyModeIndices({ dayId: 1234, seed: 7, length: 200 });
  assert.deepEqual(a, b);
  const all = [...a.termo, ...a.dueto, ...a.quarteto];
  assert.equal(all.length, 7);
  assert.equal(new Set(all).size, 7);
});

test("Persistence: serialize and resume (guesses + currentGuess)", () => {
  let s = createNewGame({ mode: Modes.termo, dayId: 42, secretsOriginal: ["TERRA"], seed: 0 });
  s = applyGuess(s, "PLANO");
  s = addLetter(s, "A");
  s = addLetter(s, "B");

  const saved = serializeGame(s);
  const base = createNewGame({ mode: Modes.termo, dayId: 42, secretsOriginal: ["TERRA"], seed: 0 });
  const resumed = hydrateGame({ saved, baseState: base });

  assert.deepEqual(resumed.guesses, ["PLANO"]);
  assert.equal(resumed.currentGuess, "AB");
  assert.equal(resumed.evaluations.length, 1);
});

async function run() {
  let passed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      passed += 1;
      console.log(`ok - ${t.name}`);
    } catch (e) {
      console.error(`not ok - ${t.name}`);
      console.error((e && e.stack) || e);
      process.exitCode = 1;
    }
  }
  console.log(`\n${passed}/${tests.length} passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

run();
