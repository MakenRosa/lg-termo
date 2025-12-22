import test from "node:test";
import assert from "node:assert/strict";

import { createNewGame, addLetter, applyGuess } from "../src/core/gameState.js";
import { hydrateGame, serializeGame } from "../src/core/persistence.js";
import { Modes } from "../src/core/modes.js";

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
