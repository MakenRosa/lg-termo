import { el } from "./dom.js";

const ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
];

function actionForKey(label) {
  if (label === "ENTER") return { type: "enter" };
  if (label === "BACK") return { type: "back" };
  return { type: "letter", letter: label };
}

export function createKeyboard({ onAction }) {
  const root = el("section", { class: "keyboard", "aria-label": "Teclado" });
  const grid = [];
  const keyButtons = [];
  let enterPos = { r: 0, c: 0 };

  for (let r = 0; r < ROWS.length; r += 1) {
    const rowLabels = ROWS[r];
    const row = el("div", { class: "kb-row", role: "row" });
    const rowButtons = [];

    for (let c = 0; c < rowLabels.length; c += 1) {
      const label = rowLabels[c];
      const action = actionForKey(label);
      const letter = action.type === "letter" ? action.letter : null;

      const btn = el(
        "button",
        {
          class: `kb-key ${action.type !== "letter" ? "kb-key--wide" : ""}`.trim(),
          type: "button",
          tabindex: "0",
          dataset: {
            role: "kb",
            r: String(r),
            c: String(c),
            action: action.type,
            letter: letter || "",
            label,
          },
          "aria-label": action.type === "enter" ? "Enter" : action.type === "back" ? "Apagar" : `Letra ${label}`,
          onclick: () => onAction(action),
        },
        [label === "BACK" ? "\u232B" : label]
      );
      if (label === "ENTER") enterPos = { r, c };
      rowButtons.push(btn);
      keyButtons.push(btn);
      row.append(btn);
    }

    grid.push(rowButtons);
    root.append(row);
  }

  function render(keyboardState = {}, keyboardPerBoard = null) {
    const isDueto = Array.isArray(keyboardPerBoard) && keyboardPerBoard.length === 2;
    const isQuarteto = Array.isArray(keyboardPerBoard) && keyboardPerBoard.length === 4;

    for (const btn of keyButtons) {
      const letter = btn.dataset.letter;
      if (!letter) {
        btn.classList.remove("kb-key--absent", "kb-key--present", "kb-key--correct", "kb-key--split", "kb-key--quad");
        btn.removeAttribute("data-left-state");
        btn.removeAttribute("data-right-state");
        btn.removeAttribute("data-tl-state");
        btn.removeAttribute("data-tr-state");
        btn.removeAttribute("data-bl-state");
        btn.removeAttribute("data-br-state");
        continue;
      }

      if (isDueto) {
        const leftState = keyboardPerBoard[0][letter] || null;
        const rightState = keyboardPerBoard[1][letter] || null;

        // If any side has been tested, show split mode
        if (leftState || rightState) {
          btn.classList.remove("kb-key--absent", "kb-key--present", "kb-key--correct", "kb-key--quad");
          btn.classList.add("kb-key--split");
          btn.dataset.leftState = leftState || "unused";
          btn.dataset.rightState = rightState || "unused";
        } else {
          // Letter not tested yet - no special styling
          btn.classList.remove("kb-key--absent", "kb-key--present", "kb-key--correct", "kb-key--split", "kb-key--quad");
          btn.removeAttribute("data-left-state");
          btn.removeAttribute("data-right-state");
        }
      } else if (isQuarteto) {
        // Quarteto: 4 quadrants - TL (board 0), TR (board 1), BL (board 2), BR (board 3)
        const tlState = keyboardPerBoard[0][letter] || null;
        const trState = keyboardPerBoard[1][letter] || null;
        const blState = keyboardPerBoard[2][letter] || null;
        const brState = keyboardPerBoard[3][letter] || null;

        // If any quadrant has been tested, show quad mode
        if (tlState || trState || blState || brState) {
          btn.classList.remove("kb-key--absent", "kb-key--present", "kb-key--correct", "kb-key--split");
          btn.classList.add("kb-key--quad");
          btn.dataset.tlState = tlState || "unused";
          btn.dataset.trState = trState || "unused";
          btn.dataset.blState = blState || "unused";
          btn.dataset.brState = brState || "unused";
        } else {
          // Letter not tested yet - no special styling
          btn.classList.remove("kb-key--absent", "kb-key--present", "kb-key--correct", "kb-key--split", "kb-key--quad");
          btn.removeAttribute("data-tl-state");
          btn.removeAttribute("data-tr-state");
          btn.removeAttribute("data-bl-state");
          btn.removeAttribute("data-br-state");
        }
      } else {
        // Original behavior for termo
        btn.classList.remove("kb-key--split", "kb-key--quad");
        btn.removeAttribute("data-left-state");
        btn.removeAttribute("data-right-state");
        btn.removeAttribute("data-tl-state");
        btn.removeAttribute("data-tr-state");
        btn.removeAttribute("data-bl-state");
        btn.removeAttribute("data-br-state");
        const state = keyboardState[letter];
        btn.classList.toggle("kb-key--absent", state === "absent");
        btn.classList.toggle("kb-key--present", state === "present");
        btn.classList.toggle("kb-key--correct", state === "correct");
      }
    }
  }

  function focusAt(r, c) {
    const row = grid[r];
    const btn = row && row[c];
    if (btn) btn.focus();
  }

  function firstKey() {
    return { r: 0, c: 0 };
  }

  function clampPos({ r, c }) {
    const rr = Math.max(0, Math.min(grid.length - 1, r));
    const rowLen = grid[rr] ? grid[rr].length : 1;
    const cc = Math.max(0, Math.min(rowLen - 1, c));
    return { r: rr, c: cc };
  }

  function move({ r, c }, dir) {
    const curRowLen = grid[r] ? grid[r].length : 1;
    const ratio = curRowLen <= 1 ? 0 : c / (curRowLen - 1);

    if (dir === "left") return clampPos({ r, c: c - 1 });
    if (dir === "right") return clampPos({ r, c: c + 1 });
    if (dir === "up") {
      const nr = Math.max(0, r - 1);
      const len = grid[nr] ? grid[nr].length : 1;
      const nc = len <= 1 ? 0 : Math.round(ratio * (len - 1));
      return clampPos({ r: nr, c: nc });
    }
    if (dir === "down") {
      const nr = Math.min(grid.length - 1, r + 1);
      const len = grid[nr] ? grid[nr].length : 1;
      const nc = len <= 1 ? 0 : Math.round(ratio * (len - 1));
      return clampPos({ r: nr, c: nc });
    }
    return { r, c };
  }

  return {
    root,
    render,
    focusAt,
    firstKey,
    move,
    enterKey: () => ({ ...enterPos }),
  };
}
