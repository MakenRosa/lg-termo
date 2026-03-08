import { el, clear } from "./dom.js";
import { modeConfig } from "../core/modes.js";

/**
 * Creates mini board previews for other players in multiplayer mode.
 * Shows only cell colors (no letters) - empty squares for unused cells.
 */
export function createPreviewBoards() {
    const leftContainer = el("div", { class: "preview-container preview-container--left" });
    const rightContainer = el("div", { class: "preview-container preview-container--right" });

    let lastPositions = {}; // Track positions for animations

    /**
     * Render preview boards for other players
     * @param {Object} options
     * @param {Array} options.leftPlayers - Players to show on left [{id, name, state}]
     * @param {Array} options.rightPlayers - Players to show on right [{id, name, state}]
     * @param {string} options.animationDirection - 'left', 'right', or null
     */
    function render({ leftPlayers = [], rightPlayers = [], animationDirection = null }) {
        // Filter out players without valid state
        const validLeftPlayers = leftPlayers.filter(p => p && p.state);
        const validRightPlayers = rightPlayers.filter(p => p && p.state);

        // Clear and rebuild left container
        clear(leftContainer);
        validLeftPlayers.forEach((player, idx) => {
            const preview = createSinglePreview(player, animationDirection, "left", idx);
            leftContainer.append(preview);
        });

        // Clear and rebuild right container
        clear(rightContainer);
        validRightPlayers.forEach((player, idx) => {
            const preview = createSinglePreview(player, animationDirection, "right", idx);
            rightContainer.append(preview);
        });

        // Show/hide containers based on content
        leftContainer.style.display = validLeftPlayers.length > 0 ? "flex" : "none";
        rightContainer.style.display = validRightPlayers.length > 0 ? "flex" : "none";
    }

    /**
     * Create a single preview board element
     */
    function createSinglePreview(player, animationDirection, side, index) {
        const { id, name, state } = player;
        const cfg = modeConfig(state.mode, { wordLength: state.wordLength });

        // Determine animation class
        // When turn changes (animationDirection='left'), new previews slide in:
        // - Left side: new preview slides in from the left
        // - Right side: new preview slides in from the right
        let animClass = "";
        if (animationDirection === "left") {
            if (side === "left") {
                animClass = "preview--slide-in-left";
            } else if (side === "right") {
                animClass = "preview--slide-in-right";
            }
        }

        const wrapper = el("div", {
            class: `preview-player ${animClass}`.trim(),
            dataset: { playerId: id, side, index: String(index) },
        });

        const nameLabel = el("div", { class: "preview-player-name" }, [name]);
        wrapper.append(nameLabel);

        // Create preview boards (one per board in the mode)
        const boardsWrap = el("div", { class: `preview-boards preview-boards--${state.mode}` });

        for (let b = 0; b < cfg.boards; b++) {
            const board = createPreviewBoard(state, b, cfg);
            boardsWrap.append(board);
        }

        wrapper.append(boardsWrap);
        return wrapper;
    }

    /**
     * Create a single mini board showing only colors
     */
    function createPreviewBoard(state, boardIndex, cfg) {
        const board = el("div", { class: "preview-board" });
        const grid = el("div", { class: "preview-grid" });
        const solvedAt = Array.isArray(state.solvedAt) ? state.solvedAt[boardIndex] : null;

        const wordLength = state.wordLength || 5;
        for (let r = 0; r < cfg.maxAttempts; r++) {
            const row = el("div", { class: "preview-row" });
            const hideAfterSolved = solvedAt != null && r >= solvedAt;

            let states = null;
            let hasContent = false;

            if (!hideAfterSolved) {
                if (r < state.guesses.length) {
                    states = state.evaluations[r] && state.evaluations[r][boardIndex]
                        ? state.evaluations[r][boardIndex]
                        : null;
                    hasContent = true;
                }
            }

            for (let c = 0; c < wordLength; c++) {
                const st = states && states[c] ? states[c] : "empty";
                const cell = el("div", {
                    class: `preview-cell preview-cell--${st}`,
                });
                row.append(cell);
            }

            grid.append(row);
        }

        board.append(grid);
        return board;
    }

    /**
     * Hide all previews (for single player mode)
     */
    function hide() {
        leftContainer.style.display = "none";
        rightContainer.style.display = "none";
    }

    return {
        leftContainer,
        rightContainer,
        render,
        hide,
    };
}
