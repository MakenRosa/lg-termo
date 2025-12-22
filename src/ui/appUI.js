import { el } from "./dom.js";
import { createKeyboard } from "./keyboard.js";
import { createBoards } from "./boards.js";
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
  const boards = createBoards();
  const message = el("div", { class: "message", role: "status", "aria-live": "polite" });

  let lastRevealRowIndex = null;
  const keyboard = createKeyboard({
    onAction: (action) => onKeyboardAction(action),
  });

  const modalHost = createModalHost({ onRequestClose: onModalRequestClose });

  main.append(boards.root, message, keyboard.root);
  app.append(topbar, main, modalHost.root);
  root.append(app);

  let lastKeyboardPos = keyboard.firstKey();
  let lastTopIndex = 0;

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

  function render(state, { settings }) {
    app.dataset.mode = state.mode;
    const selected =
      state.mode === Modes.termo ? 0 : state.mode === Modes.dueto ? 1 : state.mode === Modes.quarteto ? 2 : 0;
    modeButtons.forEach((b, i) => b.classList.toggle("top-btn--active", i === selected));

    message.textContent = state.lastMessage || "";
    setColorblind(!!settings.colorblind);

    boards.render(state, { revealRowIndex: lastRevealRowIndex });
    keyboard.render(state.keyboard);
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
