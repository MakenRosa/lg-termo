import { applyGuess } from "./gameState.js";

export const STORAGE_VERSION = 1;

export function progressKey({ profileId, mode, dayId, seed, wordLength = 5 }) {
  return `lgtermo_progress_${profileId}_${mode}_${wordLength}_${dayId}_${seed}`;
}

export function legacyProgressKey({ mode, dayId, seed }) {
  return `lgtermo_progress_${mode}_${dayId}_${seed}`;
}

export function serializeGame(state) {
  return {
    version: STORAGE_VERSION,
    mode: state.mode,
    wordLength: state.wordLength,
    dayId: state.dayId,
    seed: state.seed,
    guesses: state.guesses,
    currentGuess: state.currentGuess,
  };
}

export function hydrateGame({ saved, baseState }) {
  if (!saved || saved.version !== STORAGE_VERSION) return baseState;
  if (saved.mode !== baseState.mode) return baseState;
  if (saved.dayId !== baseState.dayId) return baseState;
  if (saved.seed !== baseState.seed) return baseState;

  let st = baseState;
  if (Array.isArray(saved.guesses)) {
    for (const g of saved.guesses) {
      st = applyGuess(st, String(g));
      if (st.status !== "playing") break;
    }
  }
  if (typeof saved.currentGuess === "string" && st.status === "playing") {
    const maxLength = st.wordLength || 5;
    st = { ...st, currentGuess: saved.currentGuess.slice(0, maxLength) };
  }
  return st;
}
