import { el } from "./dom.js";
import { createKeyboard } from "./keyboard.js";
import { createBoards } from "./boards.js";
import { createPreviewBoards } from "./previewBoards.js";
import { createModalHost } from "./modals.js";
import { Modes } from "../core/modes.js";

const TOP_ACTIONS = Object.freeze({
  help: "help",
  stats: "stats",
  settings: "settings",
  exit: "exit",
});

function isTypingTarget(node) {
  if (!node) return false;
  const tag = node.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    if (node.readOnly || (node.dataset && node.dataset.locked === "1")) return false;
    return true;
  }
  return false;
}

function isBackKey(e) {
  return e.key === "Backspace" || e.key === "Escape" || e.keyCode === 461; // 461: webOS Back
}

export function createAppUI({
  root,
  onModeChange,
  onTopAction,
  onKeyboardAction,
  onSubmitFromPhysicalEnter,
  onBackFromPhysical,
  onLetterFromPhysical,
  onNavFallback,
  onViewerAction,
  onModalRequestClose,
}) {
  const app = el("div", { class: "app" });
  const topbar = el("header", { class: "topbar" });
  const title = el("div", { class: "brand", text: "TermoTV" });

  const modeWrap = el("div", { class: "mode-wrap", role: "group", "aria-label": "Modo" });
  const modeButtons = [
    topButton("Termo", () => onModeChange(Modes.termo)),
    topButton("Dueto", () => onModeChange(Modes.dueto)),
    topButton("Quarteto", () => onModeChange(Modes.quarteto)),
  ];
  modeButtons.forEach((b, i) => {
    b.dataset.role = "top";
    b.dataset.topIndex = String(i);
  });
  modeWrap.append(...modeButtons);

  const actionsWrap = el("div", { class: "actions-wrap", role: "group", "aria-label": "A\u00E7\u00F5es" });
  const actionButtons = [
    topButton("Ajuda", () => onTopAction(TOP_ACTIONS.help)),
    topButton("Stats", () => onTopAction(TOP_ACTIONS.stats)),
    topButton("Config", () => onTopAction(TOP_ACTIONS.settings)),
    topButton("Sair", () => onTopAction(TOP_ACTIONS.exit)),
  ];
  actionButtons.forEach((b, i) => {
    b.dataset.role = "top";
    b.dataset.topIndex = String(i + modeButtons.length);
  });
  actionsWrap.append(...actionButtons);

  topbar.append(title, modeWrap, actionsWrap);

  const main = el("main", { class: "main" });
  const viewerBar = el("div", { class: "viewer-bar" });
  const viewerTitle = el("div", { class: "viewer-title" });
  const viewerActions = el("div", { class: "viewer-actions" });
  const viewerPrev = el(
    "button",
    {
      class: "btn btn--ghost viewer-btn",
      type: "button",
      dataset: { role: "viewer", viewerIndex: "0" },
      onclick: () => onViewerAction && onViewerAction("prev"),
    },
    ["Anterior"]
  );
  const viewerNext = el(
    "button",
    {
      class: "btn btn--ghost viewer-btn",
      type: "button",
      dataset: { role: "viewer", viewerIndex: "1" },
      onclick: () => onViewerAction && onViewerAction("next"),
    },
    ["Pr\u00F3ximo"]
  );
  const viewerClose = el(
    "button",
    {
      class: "btn viewer-btn",
      type: "button",
      dataset: { role: "viewer", viewerIndex: "2" },
      onclick: () => onViewerAction && onViewerAction("close"),
    },
    ["Voltar"]
  );
  viewerActions.append(viewerPrev, viewerNext, viewerClose);
  viewerBar.append(viewerTitle, viewerActions);
  const boards = createBoards();
  const playerStatus = el("div", { class: "player-status" });
  const message = el("div", { class: "message", role: "status", "aria-live": "polite" });

  let lastRevealRowIndex = null;
  const keyboard = createKeyboard({
    onAction: (action) => onKeyboardAction(action),
  });

  // Preview boards for multiplayer mode
  const previewBoards = createPreviewBoards();
  const keyboardRow = el("div", { class: "keyboard-row" });
  keyboardRow.append(previewBoards.leftContainer, keyboard.root, previewBoards.rightContainer);

  const modalHost = createModalHost({ onRequestClose: onModalRequestClose });

  main.append(viewerBar, boards.root, playerStatus, message, keyboardRow);
  app.append(topbar, main, modalHost.root);
  root.append(app);

  let lastKeyboardPos = keyboard.firstKey();
  let lastTopIndex = 0;
  let viewerActive = false;
  let lastPlayerIndex = null; // Track for animation direction

  function focusTop(index) {
    const all = app.querySelectorAll("button[data-role='top']");
    const btn = all[index];
    if (btn) {
      lastTopIndex = index;
      btn.focus();
    }
  }

  function focusKeyboard(pos) {
    lastKeyboardPos = pos;
    keyboard.focusAt(pos.r, pos.c);
  }

  function currentTopButtons() {
    return Array.from(app.querySelectorAll("button[data-role='top']"));
  }

  function handleNavKey(key) {
    const active = document.activeElement;
    const role = active && active.dataset ? active.dataset.role : undefined;

    if (modalHost.isOpen()) {
      if (isBackKey({ key, keyCode: 0 })) {
        modalHost.close();
        return true;
      }
      const focusables = Array.from(modalHost.root.querySelectorAll("button,input,[tabindex='0']"))
        .filter((n) => !n.disabled && n.getAttribute("aria-hidden") !== "true")
        .map((el, index) => ({
          el,
          index,
          order: Number.parseFloat(el.dataset.focusOrder),
        }))
        .sort((a, b) => {
          const ao = Number.isFinite(a.order) ? a.order : Number.POSITIVE_INFINITY;
          const bo = Number.isFinite(b.order) ? b.order : Number.POSITIVE_INFINITY;
          if (ao !== bo) return ao - bo;
          return a.index - b.index;
        })
        .map((item) => item.el);
      if (focusables.length === 0) return true;
      const idx = Math.max(0, focusables.indexOf(document.activeElement));
      const nextIdx =
        key === "ArrowLeft" || key === "ArrowUp"
          ? (idx - 1 + focusables.length) % focusables.length
          : (idx + 1) % focusables.length;
      focusables[nextIdx].focus();
      return true;
    }

    if (role === "kb") {
      const r = Number.parseInt(active.dataset.r, 10) || 0;
      const c = Number.parseInt(active.dataset.c, 10) || 0;
      lastKeyboardPos = { r, c };

      if (key === "ArrowUp" && r === 0) {
        focusTop(lastTopIndex);
        return true;
      }

      const dir =
        key === "ArrowLeft"
          ? "left"
          : key === "ArrowRight"
            ? "right"
            : key === "ArrowUp"
              ? "up"
              : key === "ArrowDown"
                ? "down"
                : null;
      if (!dir) return false;
      const next = keyboard.move({ r, c }, dir);
      focusKeyboard(next);
      return true;
    }

    if (role === "top") {
      const all = currentTopButtons();
      const idx = Math.max(0, all.indexOf(active));
      lastTopIndex = idx;

      if (key === "ArrowDown") {
        focusKeyboard(lastKeyboardPos);
        return true;
      }
      if (key === "ArrowLeft") {
        focusTop(Math.max(0, idx - 1));
        return true;
      }
      if (key === "ArrowRight") {
        focusTop(Math.min(all.length - 1, idx + 1));
        return true;
      }
      return false;
    }

    if (role === "viewer") {
      const buttons = Array.from(app.querySelectorAll("button[data-role='viewer']"));
      const idx = Math.max(0, buttons.indexOf(active));
      if (buttons.length === 0) return true;
      if (["ArrowLeft", "ArrowUp"].includes(key)) {
        buttons[(idx - 1 + buttons.length) % buttons.length].focus();
        return true;
      }
      if (["ArrowRight", "ArrowDown"].includes(key)) {
        buttons[(idx + 1) % buttons.length].focus();
        return true;
      }
      return false;
    }

    return onNavFallback ? !!onNavFallback(key) : false;
  }

  function handleKeydown(e) {
    if (modalHost.isOpen()) {
      if (isBackKey(e)) {
        e.preventDefault();
        modalHost.close();
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && !isTypingTarget(document.activeElement)) {
        e.preventDefault();
        handleNavKey(e.key);
      }
      return;
    }

    if (isBackKey(e)) {
      e.preventDefault();
      if (onBackFromPhysical) onBackFromPhysical();
      return;
    }

    if (viewerActive) {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && !isTypingTarget(document.activeElement)) {
        e.preventDefault();
        handleNavKey(e.key);
      }
      return;
    }

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) && !isTypingTarget(document.activeElement)) {
      e.preventDefault();
      handleNavKey(e.key);
      return;
    }

    if (isTypingTarget(document.activeElement)) return;

    if (/^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      if (onLetterFromPhysical) onLetterFromPhysical(e.key.toUpperCase());
      return;
    }

    if (e.key === "Enter" && (!document.activeElement || document.activeElement.tagName !== "BUTTON")) {
      e.preventDefault();
      if (onSubmitFromPhysicalEnter) onSubmitFromPhysicalEnter();
    }
  }

  window.addEventListener("keydown", handleKeydown);

  function topButton(label, onClick) {
    return el(
      "button",
      {
        class: "top-btn",
        type: "button",
        tabindex: "0",
        onclick: onClick,
      },
      [label]
    );
  }

  function setColorblind(enabled) {
    app.dataset.colorblind = enabled ? "1" : "0";
  }

  function render(state, { settings, player, viewer, previews }) {
    app.dataset.mode = state.mode;
    const selected =
      state.mode === Modes.termo ? 0 : state.mode === Modes.dueto ? 1 : state.mode === Modes.quarteto ? 2 : 0;
    modeButtons.forEach((b, i) => b.classList.toggle("top-btn--active", i === selected));

    message.textContent = state.lastMessage || "";
    setColorblind(!!settings.colorblind);

    viewerActive = !!viewer;
    app.dataset.viewer = viewerActive ? "1" : "0";
    if (viewer) {
      viewerTitle.textContent = `Visualizando: ${viewer.name} (${viewer.index}/${viewer.total})`;
      viewerBar.style.display = "flex";
    } else {
      viewerTitle.textContent = "";
      viewerBar.style.display = "none";
    }

    if (player && !viewerActive) {
      playerStatus.textContent = `Jogador: ${player.name} (${player.index}/${player.total})`;
      playerStatus.style.display = "block";
      app.dataset.multiplayer = "1";
    } else {
      playerStatus.textContent = "";
      playerStatus.style.display = "none";
      app.dataset.multiplayer = "0";
    }

    // Render preview boards for multiplayer
    if (previews && previews.players && previews.players.length > 1 && !viewerActive) {
      const { players, currentIndex } = previews;
      const total = players.length;

      // Determine animation direction
      let animationDirection = null;
      if (lastPlayerIndex !== null && lastPlayerIndex !== currentIndex) {
        // Turn advanced - animate left (previous goes left, next comes from right)
        animationDirection = "left";
      }
      lastPlayerIndex = currentIndex;

      // Calculate left and right players based on positioning rules:
      // - Left: previous player(s) (who just played)
      // - Right: next player(s) (who will play next)
      const leftPlayers = [];
      const rightPlayers = [];

      if (total === 2) {
        // 2 players: 1 preview on right (the other player)
        const otherIndex = (currentIndex + 1) % total;
        rightPlayers.push(players[otherIndex]);
      } else if (total === 3) {
        // 3 players: 1 left (previous), 1 right (next)
        const prevIndex = (currentIndex - 1 + total) % total;
        const nextIndex = (currentIndex + 1) % total;
        leftPlayers.push(players[prevIndex]);
        rightPlayers.push(players[nextIndex]);
      } else if (total === 4) {
        // 4 players: 2 left (two previous), 1 right (next)
        const prevIndex1 = (currentIndex - 1 + total) % total;
        const prevIndex2 = (currentIndex - 2 + total) % total;
        const nextIndex = (currentIndex + 1) % total;
        // Order: most recent on right side of left container
        leftPlayers.push(players[prevIndex2]);
        leftPlayers.push(players[prevIndex1]);
        rightPlayers.push(players[nextIndex]);
      }

      previewBoards.render({ leftPlayers, rightPlayers, animationDirection });
    } else {
      previewBoards.hide();
      lastPlayerIndex = null;
    }

    boards.render(state, { revealRowIndex: lastRevealRowIndex });
    keyboard.render(state.keyboard, state.keyboardPerBoard);
    if (state.currentGuess && state.currentGuess.length >= 5) {
      const active = document.activeElement;
      if (active && active.dataset && active.dataset.role === "kb") {
        focusKeyboard(keyboard.enterKey());
      }
    }

    // Keep reveal row only for one paint
    lastRevealRowIndex = null;
  }

  function setRevealRowIndex(rowIndex) {
    lastRevealRowIndex = rowIndex;
  }

  function initialFocus() {
    if (viewerActive) {
      viewerClose.focus();
      return;
    }
    focusKeyboard(lastKeyboardPos);
  }

  return {
    render,
    setRevealRowIndex,
    initialFocus,
    modal: modalHost,
    focusTop,
    focusKeyboard,
  };
}
