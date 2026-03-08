import { el, clear } from "./dom.js";
import { modeConfig } from "../core/modes.js";

export function createBoards() {
  const root = el("section", { class: "boards", "aria-label": "Tabuleiros" });

  function render(state, { revealRowIndex = null } = {}) {
    const cfg = modeConfig(state.mode, { wordLength: state.wordLength });
    const wordLength = state.wordLength || 5;
    root.className = `boards boards--${state.mode}`;
    clear(root);

    for (let b = 0; b < cfg.boards; b += 1) {
      const board = el("div", { class: "board", dataset: { board: String(b) } });
      const grid = el("div", { class: "grid", role: "grid", "aria-label": `Tabuleiro ${b + 1}` });
      const solvedAt = Array.isArray(state.solvedAt) ? state.solvedAt[b] : null;

      for (let r = 0; r < cfg.maxAttempts; r += 1) {
        const isReveal = revealRowIndex === r;
        const row = el("div", { class: `row ${isReveal ? "row--reveal" : ""}`.trim(), role: "row" });

        let letters = "";
        let states = null;
        const hideAfterSolved = solvedAt != null && r >= solvedAt;

        if (!hideAfterSolved) {
          if (r < state.guesses.length) {
            letters = state.guesses[r];
            states = state.evaluations[r] && state.evaluations[r][b] ? state.evaluations[r][b] : null;
          } else if (r === state.guesses.length && state.status === "playing") {
            letters = state.currentGuess;
            states = null;
          }
        }

        for (let c = 0; c < wordLength; c += 1) {
          const ch = letters && letters[c] ? letters[c] : "";
          const st = states && states[c] ? states[c] : ch ? "pending" : "empty";
          const cell = el(
            "div",
            {
              class: `cell cell--${st}`,
              role: "gridcell",
              style: isReveal && states ? `--reveal-delay:${c * 90}ms` : "",
            },
            [ch]
          );
          row.append(cell);
        }

        grid.append(row);
      }

      board.append(grid);
      root.append(board);
    }
  }

  return { root, render };
}
