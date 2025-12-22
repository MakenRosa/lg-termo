import test from "node:test";
import assert from "node:assert/strict";

import { evaluateGuess } from "../src/core/evaluateGuess.js";
import { createNewGame, submitGuess } from "../src/core/gameState.js";
import { Modes } from "../src/core/modes.js";

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
  assert.equal(Array.isArray(s2.evaluations[0]), true);
  assert.equal(s2.evaluations[0].length, 2);
});
