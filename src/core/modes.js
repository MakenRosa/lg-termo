export const Modes = Object.freeze({
  termo: "termo",
  dueto: "dueto",
  quarteto: "quarteto",
});

export const WordLengths = Object.freeze({
  five: 5,
  six: 6,
});

export function normalizeWordLength(value) {
  const numeric = Number(value);
  return numeric === WordLengths.six ? WordLengths.six : WordLengths.five;
}

export function modeKey(mode, wordLength = WordLengths.five) {
  const length = normalizeWordLength(wordLength);
  return length === WordLengths.six ? `${mode}6` : mode;
}

export function modeConfig(mode, { wordLength = WordLengths.five } = {}) {
  const length = normalizeWordLength(wordLength);
  const lengthLabel = length === WordLengths.six ? " 6" : "";
  switch (mode) {
    case Modes.termo:
      return { boards: 1, maxAttempts: 6, title: `Termo${lengthLabel}` };
    case Modes.dueto:
      return { boards: 2, maxAttempts: 7, title: `Dueto${lengthLabel}` };
    case Modes.quarteto:
      return { boards: 4, maxAttempts: 9, title: `Quarteto${lengthLabel}` };
    default:
      throw new Error(`Unknown mode: ${mode}`);
  }
}
