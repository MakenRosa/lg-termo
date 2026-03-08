import { normalizeWord } from "./normalize.js";
import { normalizeWordLength, WordLengths } from "./modes.js";

/**
 * Evaluate a guess against a secret (Wordle-style).
 *
 * States:
 * - "correct" (green)
 * - "present" (yellow)
 * - "absent"  (gray)
 *
 * Accent policy: comparison is done with diacritics removed.
 */
export function evaluateGuess(secret, guess, wordLength = WordLengths.five) {
  const secretNorm = normalizeWord(secret);
  const guessNorm = normalizeWord(guess);
  const targetLength = normalizeWordLength(wordLength || secretNorm.length);

  if (secretNorm.length !== targetLength) {
    throw new Error(`Secret must normalize to ${targetLength} letters, got ${secretNorm.length}`);
  }
  if (guessNorm.length !== targetLength) {
    throw new Error(`Guess must normalize to ${targetLength} letters, got ${guessNorm.length}`);
  }

  const secretLetters = secretNorm.split("");
  const guessLetters = guessNorm.split("");

  const result = Array(targetLength).fill("absent");
  const remainingCounts = new Map();

  for (let i = 0; i < targetLength; i += 1) {
    if (guessLetters[i] === secretLetters[i]) {
      result[i] = "correct";
      continue;
    }
    const letter = secretLetters[i];
    remainingCounts.set(letter, (remainingCounts.get(letter) || 0) + 1);
  }

  for (let i = 0; i < targetLength; i += 1) {
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

export function isSolved(evaluation, wordLength = WordLengths.five) {
  const targetLength = normalizeWordLength(wordLength);
  return Array.isArray(evaluation) && evaluation.length === targetLength && evaluation.every((s) => s === "correct");
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
