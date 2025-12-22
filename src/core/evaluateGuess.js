import { normalizeWord } from "./normalize.js";

/**
 * Evaluate a 5-letter guess against a 5-letter secret (Wordle-style).
 *
 * States:
 * - "correct" (green)
 * - "present" (yellow)
 * - "absent"  (gray)
 *
 * Accent policy: comparison is done with diacritics removed.
 */
export function evaluateGuess(secret, guess) {
  const secretNorm = normalizeWord(secret);
  const guessNorm = normalizeWord(guess);

  if (secretNorm.length !== 5) {
    throw new Error(`Secret must normalize to 5 letters, got ${secretNorm.length}`);
  }
  if (guessNorm.length !== 5) {
    throw new Error(`Guess must normalize to 5 letters, got ${guessNorm.length}`);
  }

  const secretLetters = secretNorm.split("");
  const guessLetters = guessNorm.split("");

  const result = Array(5).fill("absent");
  const remainingCounts = new Map();

  for (let i = 0; i < 5; i += 1) {
    if (guessLetters[i] === secretLetters[i]) {
      result[i] = "correct";
      continue;
    }
    const letter = secretLetters[i];
    remainingCounts.set(letter, (remainingCounts.get(letter) || 0) + 1);
  }

  for (let i = 0; i < 5; i += 1) {
    if (result[i] === "correct") continue;
    const letter = guessLetters[i];
    const remaining = remainingCounts.get(letter) || 0;
    if (remaining > 0) {
      result[i] = "present";
      remainingCounts.set(letter, remaining - 1);
    }
  }

  return result;
}

export function isSolved(evaluation) {
  return Array.isArray(evaluation) && evaluation.length === 5 && evaluation.every((s) => s === "correct");
}

export const LetterState = Object.freeze({
  correct: "correct",
  present: "present",
  absent: "absent",
});

export function compareLetterStatePriority(a, b) {
  const p = { absent: 0, present: 1, correct: 2 };
  const pa = p[a] === undefined ? -1 : p[a];
  const pb = p[b] === undefined ? -1 : p[b];
  return pa - pb;
}

export function bestLetterState(prev, next) {
  return compareLetterStatePriority(prev, next) >= 0 ? prev : next;
}
