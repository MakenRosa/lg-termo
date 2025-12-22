import { normalizeWord } from "./normalize.js";
import { evaluateGuess, isSolved, bestLetterState } from "./evaluateGuess.js";
import { modeConfig } from "./modes.js";

export function createNewGame({ mode, dayId, secretsOriginal, seed = 0 }) {
  const cfg = modeConfig(mode);
  if (!Array.isArray(secretsOriginal) || secretsOriginal.length !== cfg.boards) {
    throw new Error(`Expected ${cfg.boards} secrets for mode ${mode}`);
  }

  const secrets = secretsOriginal.map((original) => ({
    original: String(original),
    normalized: normalizeWord(String(original)),
  }));

  for (const s of secrets) {
    if (s.normalized.length !== 5) throw new Error(`Invalid secret: ${s.original}`);
  }

  return {
    version: 1,
    mode,
    seed,
    dayId,
    maxAttempts: cfg.maxAttempts,
    boards: cfg.boards,
    secrets,
    guesses: [],
    evaluations: [],
    currentGuess: "",
    solvedAt: Array(cfg.boards).fill(null),
    status: "playing",
    keyboard: {},
    lastMessage: "",
  };
}

export function canSubmit(state) {
  return state.status === "playing" && state.currentGuess.length === 5;
}

export function addLetter(state, letter) {
  if (state.status !== "playing") return state;
  if (state.currentGuess.length >= 5) return state;
  const l = normalizeWord(letter).slice(0, 1);
  if (!l) return state;
  return { ...state, currentGuess: (state.currentGuess + l).slice(0, 5), lastMessage: "" };
}

export function removeLetter(state) {
  if (state.status !== "playing") return state;
  if (!state.currentGuess) return state;
  return { ...state, currentGuess: state.currentGuess.slice(0, -1), lastMessage: "" };
}

export function setMessage(state, message) {
  return { ...state, lastMessage: String(message || "") };
}

export function submitGuess(state, { dictionarySet }) {
  if (state.status !== "playing") return state;
  if (state.currentGuess.length !== 5) return setMessage(state, "Complete 5 letras.");

  const guess = normalizeWord(state.currentGuess);
  if (!(dictionarySet instanceof Set) || !dictionarySet.has(guess)) {
    return setMessage(state, "Palavra inv\u00E1lida.");
  }

  const next = applyGuess(state, guess);
  return { ...next, currentGuess: "", lastMessage: "" };
}

export function applyGuess(state, guess) {
  if (state.status !== "playing") return state;
  if (state.guesses.length >= state.maxAttempts) return state;
  const g = normalizeWord(guess);
  if (g.length !== 5) return state;

  const perBoard = state.secrets.map((s) => evaluateGuess(s.original, g));
  const solvedAt = state.solvedAt.slice();
  for (let b = 0; b < perBoard.length; b += 1) {
    if (solvedAt[b] == null && isSolved(perBoard[b])) solvedAt[b] = state.guesses.length + 1;
  }

  const keyboard = { ...state.keyboard };
  for (let b = 0; b < perBoard.length; b += 1) {
    const evalRow = perBoard[b];
    for (let i = 0; i < 5; i += 1) {
      const letter = g[i];
      keyboard[letter] = bestLetterState(keyboard[letter] || "absent", evalRow[i]);
    }
  }

  const guesses = state.guesses.concat([g]);
  const evaluations = state.evaluations.concat([perBoard]);
  const allSolved = solvedAt.every((v) => v != null);

  let status = state.status;
  if (allSolved) status = "won";
  else if (guesses.length >= state.maxAttempts) status = "lost";

  return {
    ...state,
    guesses,
    evaluations,
    solvedAt,
    keyboard,
    status,
  };
}
