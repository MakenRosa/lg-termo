import { modeConfig, Modes, normalizeWordLength, WordLengths } from "./modes.js";

const EMOJI = Object.freeze({
  correct: "\uD83D\uDFE9",
  present: "\uD83D\uDFE8",
  absent: "\u2B1B",
  empty: "\u2B1C",
});

function boardEmojiLines({ guesses, evaluationsForBoard, maxAttempts, wordLength }) {
  const targetLength = normalizeWordLength(wordLength);
  const lines = [];
  for (let r = 0; r < maxAttempts; r += 1) {
    if (r >= guesses.length) break;
    const evalRow = evaluationsForBoard ? evaluationsForBoard[r] : null;
    const row = (evalRow || Array(targetLength).fill("empty")).map((s) => EMOJI[s] || EMOJI.empty).join("");
    lines.push(row);
  }
  return lines;
}

function resultToken({ solvedAt, maxAttempts }) {
  return solvedAt == null ? `X/${maxAttempts}` : `${solvedAt}/${maxAttempts}`;
}

export function buildShareText(state) {
  const length = normalizeWordLength(state.wordLength || WordLengths.five);
  const cfg = modeConfig(state.mode, { wordLength: length });
  const dayLabel = `#${state.dayId}`;

  const perBoardSolved = state.solvedAt.map((v) => (v == null ? "X" : String(v)));
  let header = `TermoTV ${cfg.title} ${dayLabel} `;

  if (state.mode === Modes.termo) {
    header += resultToken({ solvedAt: state.solvedAt[0], maxAttempts: cfg.maxAttempts });
  } else {
    header += `${perBoardSolved.join("")}/${cfg.maxAttempts}`;
  }

  const lines = [header, ""]; 

  for (let b = 0; b < cfg.boards; b += 1) {
    const evalsForBoard = state.evaluations.map((perBoard) => perBoard[b]);
    const gridLines = boardEmojiLines({
      guesses: state.guesses,
      evaluationsForBoard: evalsForBoard,
      maxAttempts: cfg.maxAttempts,
      wordLength: length,
    });
    lines.push(`Palavra ${b + 1}: ${resultToken({ solvedAt: state.solvedAt[b], maxAttempts: cfg.maxAttempts })}`);
    lines.push(...gridLines);
    if (b !== cfg.boards - 1) lines.push("");
  }

  return lines.join("\n").trimEnd();
}
