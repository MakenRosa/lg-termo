export const Modes = Object.freeze({
  termo: "termo",
  dueto: "dueto",
  quarteto: "quarteto",
});

export function modeConfig(mode) {
  switch (mode) {
    case Modes.termo:
      return { boards: 1, maxAttempts: 6, title: "Termo" };
    case Modes.dueto:
      return { boards: 2, maxAttempts: 7, title: "Dueto" };
    case Modes.quarteto:
      return { boards: 4, maxAttempts: 9, title: "Quarteto" };
    default:
      throw new Error(`Unknown mode: ${mode}`);
  }
}

