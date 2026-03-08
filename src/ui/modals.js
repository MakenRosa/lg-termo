import { el, clear } from "./dom.js";
import { modeConfig, modeKey, normalizeWordLength, WordLengths } from "../core/modes.js";

const HELP_EMOJI = Object.freeze({
  correct: "\uD83D\uDFE9",
  present: "\uD83D\uDFE8",
  absent: "\u2B1B",
});

function modalShell({ title, onClose, showClose = true, className = "" }) {
  const overlay = el("div", { class: "modal-overlay", role: "dialog", "aria-modal": "true" });
  const modal = el("div", { class: `modal ${className}`.trim() });
  const headerChildren = [el("div", { class: "modal-title", text: title })];
  if (showClose) {
    headerChildren.push(
      el(
        "button",
        {
          class: "btn btn--ghost",
          type: "button",
          dataset: { focus: "modal" },
          onclick: onClose,
          "aria-label": "Fechar",
        },
        ["Fechar"]
      )
    );
  }
  const header = el("div", { class: "modal-header" }, headerChildren);
  const body = el("div", { class: "modal-body" });
  modal.append(header, body);
  overlay.append(modal);
  return { overlay, body };
}

export function createModalHost({ onRequestClose }) {
  const root = el("div", { class: "modal-host", "aria-hidden": "true" });

  let current = null;

  function close() {
    if (!current) return;
    clear(root);
    root.setAttribute("aria-hidden", "true");
    current = null;
    if (onRequestClose) onRequestClose();
  }

  function show(contentOverlay) {
    clear(root);
    root.append(contentOverlay);
    root.setAttribute("aria-hidden", "false");
    current = contentOverlay;
  }

  function isOpen() {
    return !!current;
  }

  function focusFirst() {
    const btn = root.querySelector("button,input,[tabindex='0']");
    if (btn) btn.focus();
  }

  function renderHelp({ wordLength } = {}) {
    const length = normalizeWordLength(wordLength || WordLengths.five);
    const { overlay, body } = modalShell({ title: "Ajuda", onClose: close });
    body.append(
      el("p", { class: "p" }, [`Adivinhe a palavra de ${length} letras.`]),
      el("ul", { class: "list" }, [
        el("li", {}, [`${HELP_EMOJI.correct} Letra na posi\u00E7\u00E3o certa.`]),
        el("li", {}, [`${HELP_EMOJI.present} Letra existe em outra posi\u00E7\u00E3o.`]),
        el("li", {}, [`${HELP_EMOJI.absent} Letra n\u00E3o aparece na palavra.`]),
      ]),
      el("p", { class: "p" }, [
        "Controle remoto: setas para navegar, OK/Enter para selecionar, Back para apagar/fechar.",
      ])
    );
    show(overlay);
    focusFirst();
  }

  function renderStats({ statsStore, profiles, currentProfileId, mode, wordLength }) {
    const length = normalizeWordLength(wordLength || WordLengths.five);
    const cfg = modeConfig(mode, { wordLength: length });
    const statsKey = modeKey(mode, length);
    const { overlay, body } = modalShell({ title: `Estat\u00EDsticas - ${cfg.title}`, onClose: close });
    const list = Array.isArray(profiles) ? profiles : [];
    if (list.length === 0) {
      body.append(el("p", { class: "p" }, ["Sem perfis."]));
      show(overlay);
      focusFirst();
      return;
    }

    function emptyModeStats() {
      return {
        played: 0,
        wins: 0,
        losses: 0,
        currentStreak: 0,
        bestStreak: 0,
        distribution: {},
      };
    }

    function modeStatsFor(profileId) {
      const profileStats = statsStore && statsStore.profiles ? statsStore.profiles[profileId] : null;
      return (profileStats && profileStats[statsKey]) || emptyModeStats();
    }

    function compareHeaderCell(label, extraClass) {
      return el(
        "div",
        { class: `stats-compare-cell stats-compare-label ${extraClass || ""}`.trim(), text: label },
        []
      );
    }

    function compareValueCell(value) {
      return el("div", { class: "stats-compare-cell stats-compare-value", text: String(value) });
    }

    body.append(el("p", { class: "p" }, ["Comparativo por perfil."]));
    const compare = el("div", { class: "stats-compare" });
    const rowsById = new Map();
    const viewTags = new Map();
    let selectedProfileId = currentProfileId;
    compare.append(
      el("div", { class: "stats-compare-row stats-compare-header" }, [
        compareHeaderCell("Perfil", "stats-compare-name"),
        compareHeaderCell("Jogos"),
        compareHeaderCell("Vit\u00F3rias"),
        compareHeaderCell("%"),
        compareHeaderCell("Sequ\u00EAncia"),
        compareHeaderCell("Melhor"),
      ])
    );

    list.forEach((profile) => {
      const ms = modeStatsFor(profile.id);
      const winPct = ms.played ? Math.round((ms.wins / ms.played) * 100) : 0;
      const isCurrent = profile.id === currentProfileId;
      const name = String(profile.name || "-");
      const rowClass = `stats-compare-row ${isCurrent ? "stats-compare-row--active" : ""}`.trim();
      const nameBtn = el(
        "button",
        { class: "stats-compare-name-btn", type: "button", onclick: () => selectProfile(profile.id) },
        [el("span", { class: "stats-compare-title", text: name })]
      );
      const viewTag = el("span", { class: "profile-tag profile-tag--view", text: "Visualizacao" });
      viewTag.style.display = "none";
      viewTags.set(profile.id, viewTag);
      const nameCell = el(
        "div",
        { class: "stats-compare-cell stats-compare-name" },
        [nameBtn, isCurrent ? el("span", { class: "profile-tag", text: "Atual" }) : null, viewTag].filter(Boolean)
      );
      const row = el("div", { class: rowClass }, [
        nameCell,
        compareValueCell(ms.played),
        compareValueCell(ms.wins),
        compareValueCell(winPct),
        compareValueCell(ms.currentStreak),
        compareValueCell(ms.bestStreak),
      ]);
      rowsById.set(profile.id, row);
      compare.append(row);
    });
    body.append(compare);

    const detailTitle = el("div", { class: "stats-section-title" });
    const detailGrid = el("div", { class: "stats-grid" });
    const dist = el("div", { class: "dist" });
    const distTitle = el("div", { class: "dist-title" });
    const distRows = el("div", { class: "dist-rows" });
    dist.append(distTitle, distRows);
    body.append(detailTitle, detailGrid, dist);

    function selectProfile(profileId) {
      selectedProfileId = profileId;
      updateSelection();
      renderDetail();
    }

    function updateSelection() {
      rowsById.forEach((row, id) => {
        row.classList.toggle("stats-compare-row--selected", id === selectedProfileId);
      });
      viewTags.forEach((tag, id) => {
        tag.style.display = id === selectedProfileId ? "inline-flex" : "none";
      });
    }

    function renderDetail() {
      const target = list.find((p) => p.id === selectedProfileId) || list[0];
      if (!target) return;
      const ms = modeStatsFor(target.id);
      const winPct = ms.played ? Math.round((ms.wins / ms.played) * 100) : 0;
      detailTitle.textContent = `Perfil: ${target.name || "-"}`;
      clear(detailGrid);
      detailGrid.append(
        statBox("Jogos", ms.played),
        statBox("Vit\u00F3rias", ms.wins),
        statBox("%", `${winPct}`),
        statBox("Sequ\u00EAncia", ms.currentStreak),
        statBox("Melhor", ms.bestStreak)
      );

      distTitle.textContent = "Distribui\u00E7\u00E3o (vit\u00F3rias)";
      clear(distRows);
      for (let i = 1; i <= cfg.maxAttempts; i += 1) {
        const count = (ms.distribution && ms.distribution[String(i)]) || 0;
        distRows.append(
          el("div", { class: "dist-row" }, [
            el("div", { class: "dist-label", text: String(i) }),
            el("div", { class: "dist-barwrap" }, [
              el("div", { class: "dist-bar", style: `--v:${count}` }, [count]),
            ]),
          ])
        );
      }
    }

    updateSelection();
    renderDetail();

    show(overlay);
    focusFirst();
  }

  function statBox(label, value) {
    return el("div", { class: "stat" }, [
      el("div", { class: "stat-value", text: String(value) }),
      el("div", { class: "stat-label", text: label }),
    ]);
  }

  function renderSettings({
    settings,
    profiles,
    currentProfileId,
    maxProfiles,
    defaultProfileId,
    onUpdateSettings,
    onResetToday,
    onResetAll,
    onSelectProfile,
    onRenameProfile,
    onDeleteProfile,
  }) {
    const { overlay, body } = modalShell({ title: `Configura\u00E7\u00F5es`, onClose: close, className: "modal--settings" });
    const now = new Date();
    const todayParts = {
      y: String(now.getFullYear()),
      m: String(now.getMonth() + 1).padStart(2, "0"),
      d: String(now.getDate()).padStart(2, "0"),
    };
    const fixed = String(settings.fixedDate || "");
    const fixedMatch = fixed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const dateParts = fixedMatch
      ? { y: fixedMatch[1], m: fixedMatch[2], d: fixedMatch[3] }
      : { ...todayParts };
    const dayInput = el("input", {
      class: "input date-input",
      type: "text",
      inputmode: "numeric",
      min: "1",
      max: "31",
      placeholder: "Dia",
      value: dateParts.d,
      onchange: (e) => {
        dateParts.d = String(e.target.value || "");
        updateFixedDate();
      },
    });
    const monthInput = el("input", {
      class: "input date-input",
      type: "text",
      inputmode: "numeric",
      min: "1",
      max: "12",
      placeholder: "M\u00EAs",
      value: dateParts.m,
      onchange: (e) => {
        dateParts.m = String(e.target.value || "");
        updateFixedDate();
      },
    });
    const yearInput = el("input", {
      class: "input date-input",
      type: "text",
      inputmode: "numeric",
      min: "1970",
      max: "2100",
      placeholder: "Ano",
      value: dateParts.y,
      onchange: (e) => {
        dateParts.y = String(e.target.value || "");
        updateFixedDate();
      },
    });

    function lockableInput(input) {
      input.readOnly = true;
      input.dataset.locked = "1";
      input.onclick = () => {
        if (!input.readOnly) return;
        input.readOnly = false;
        input.dataset.locked = "0";
        input.focus();
        if (typeof input.select === "function") input.select();
      };
      input.onblur = () => {
        input.readOnly = true;
        input.dataset.locked = "1";
      };
    }

    lockableInput(dayInput);
    lockableInput(monthInput);
    lockableInput(yearInput);

    dayInput.dataset.focusOrder = "10";
    monthInput.dataset.focusOrder = "11";
    yearInput.dataset.focusOrder = "12";

    const dateWrap = el("div", { class: "settings-row" }, [
      el("div", { class: "settings-label", text: "Data (dia/m\u00EAs/ano)" }),
      el("div", { class: "date-inputs" }, [dayInput, monthInput, yearInput]),
    ]);

    function moveCaret(input, dir) {
      const value = String(input.value || "");
      const len = value.length;
      if (typeof input.selectionStart !== "number" || typeof input.selectionEnd !== "number") {
        return dir === "left" ? 0 : len;
      }
      const pos = input.selectionStart;
      const next = dir === "left" ? Math.max(0, pos - 1) : Math.min(len, pos + 1);
      input.setSelectionRange(next, next);
      return next;
    }

    function focusNextFocusable(startEl, dir) {
      const focusables = Array.from(overlay.querySelectorAll("button,input,[tabindex='0']"))
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
        });
      const idx = focusables.findIndex((item) => item.el === startEl);
      if (idx === -1) return;
      const nextIdx = dir === "left" ? idx - 1 : idx + 1;
      const target = focusables[nextIdx];
      if (target) target.el.focus();
    }

    function handleArrow(e, input, prev, next) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (input.readOnly) return;
      const dir = e.key === "ArrowLeft" ? "left" : "right";
      const value = String(input.value || "");
      const len = value.length;
      const pos =
        typeof input.selectionStart === "number" && typeof input.selectionEnd === "number"
          ? input.selectionStart
          : dir === "left"
            ? 0
            : len;

      if ((dir === "left" && pos > 0) || (dir === "right" && pos < len)) {
        e.preventDefault();
        moveCaret(input, dir);
        return;
      }

      e.preventDefault();
      const target = dir === "left" ? prev : next;
      if (target) {
        target.focus();
        const caretPos = dir === "left" ? String(target.value || "").length : 0;
        if (typeof target.setSelectionRange === "function") {
          target.setSelectionRange(caretPos, caretPos);
        }
        return;
      }
      focusNextFocusable(input, dir);
    }

    dayInput.onkeydown = (e) => {
      handleArrow(e, dayInput, null, monthInput);
      if (e.key === "Enter") {
        e.preventDefault();
        monthInput.focus();
      }
    };
    monthInput.onkeydown = (e) => {
      handleArrow(e, monthInput, dayInput, yearInput);
      if (e.key === "Enter") {
        e.preventDefault();
        yearInput.focus();
      }
    };
    yearInput.onkeydown = (e) => {
      handleArrow(e, yearInput, monthInput, null);
      if (e.key === "Enter") {
        e.preventDefault();
        focusNextFocusable(yearInput, "right");
      }
    };

    function updateFixedDate() {
      const y = String(dateParts.y || "").trim();
      const m = String(dateParts.m || "").trim();
      const d = String(dateParts.d || "").trim();
      if (!y && !m && !d) {
        onUpdateSettings({ fixedDate: null });
        return;
      }
      if (!y || !m || !d) return;
      const yy = Number(y);
      const mm = Number(m);
      const dd = Number(d);
      if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return;
      const cand = new Date(yy, mm - 1, dd);
      if (Number.isNaN(cand.getTime())) return;
      if (cand.getFullYear() !== yy || cand.getMonth() !== mm - 1 || cand.getDate() !== dd) return;
      const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (cand.getTime() > todayLocal.getTime()) {
        dateParts.y = todayParts.y;
        dateParts.m = todayParts.m;
        dateParts.d = todayParts.d;
        dayInput.value = dateParts.d;
        monthInput.value = dateParts.m;
        yearInput.value = dateParts.y;
        onUpdateSettings({ fixedDate: null });
        return;
      }
      const mm2 = String(mm).padStart(2, "0");
      const dd2 = String(dd).padStart(2, "0");
      if (mm2 === todayParts.m && dd2 === todayParts.d && String(yy) === todayParts.y) {
        onUpdateSettings({ fixedDate: null });
        return;
      }
      onUpdateSettings({ fixedDate: `${yy}-${mm2}-${dd2}` });
    }

    const resetTodayBtn = el("button", { class: "btn btn--danger", type: "button", onclick: onResetToday }, [
      "Apagar progresso de hoje",
    ]);
    const resetAllBtn = el(
      "button",
      { class: "btn btn--danger btn--ghost", type: "button", onclick: onResetAll },
      ["Apagar tudo (stats + progresso)"]
    );
    resetTodayBtn.dataset.focusOrder = "90";
    resetAllBtn.dataset.focusOrder = "91";

    const profileTitle = el("div", { class: "settings-section-title", text: "Perfis" });
    const currentProfile = (profiles || []).find((p) => p.id === currentProfileId);
    const profileInfo = el("div", { class: "settings-row" }, [
      el("div", { class: "settings-label", text: "Perfil atual" }),
      el("div", { class: "settings-value", text: currentProfile ? currentProfile.name : "-" }),
    ]);

    const switchBtn = el("button", { class: "btn btn--ghost", type: "button", onclick: onSelectProfile }, [
      "Trocar perfil",
    ]);
    switchBtn.dataset.focusOrder = "20";

    const profileList = el("div", { class: "profile-manage" });
    (profiles || []).forEach((profile, idx) => {
      const nameInput = el("input", {
        class: "input profile-input",
        type: "text",
        value: profile.name,
        maxlength: "18",
        "aria-label": `Nome do perfil ${profile.name}`,
      });
      lockableInput(nameInput);
      const renameBtn = el(
        "button",
        {
          class: "btn btn--ghost",
          type: "button",
          onclick: () => onRenameProfile && onRenameProfile(profile.id, nameInput.value),
        },
        ["Salvar"]
      );
      const delBtn = el(
        "button",
        {
          class: "btn btn--danger btn--ghost",
          type: "button",
          disabled: (profiles || []).length <= 1 || profile.id === defaultProfileId,
          onclick: () => onDeleteProfile && onDeleteProfile(profile.id),
        },
        ["Excluir"]
      );
      const baseOrder = 30 + idx * 3;
      nameInput.dataset.focusOrder = String(baseOrder);
      renameBtn.dataset.focusOrder = String(baseOrder + 1);
      delBtn.dataset.focusOrder = String(baseOrder + 2);
      nameInput.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          focusNextFocusable(nameInput, "right");
        }
      };
      const tag = profile.id === currentProfileId ? el("span", { class: "profile-tag", text: "Atual" }) : null;
      profileList.append(
        el("div", { class: "profile-row" }, [
          el("div", { class: "profile-name" }, [nameInput, tag].filter(Boolean)),
          el("div", { class: "profile-actions" }, [renameBtn, delBtn]),
        ])
      );
    });

    if ((profiles || []).length >= maxProfiles) {
      profileList.append(el("div", { class: "profile-limit", text: `Limite de ${maxProfiles} perfis.` }));
    }

    body.append(
      dateWrap,
      profileTitle,
      profileInfo,
      switchBtn,
      profileList,
      el("div", { class: "settings-actions" }, [resetTodayBtn, resetAllBtn])
    );
    show(overlay);
    focusFirst();
  }

  function renderResult({ state, onCloseResult }) {
    const cfg = modeConfig(state.mode, { wordLength: state.wordLength });
    const title = state.status === "won" ? `Voc\u00EA venceu!` : "Fim de jogo";
    const { overlay, body } = modalShell({ title, onClose: onCloseResult || close });

    const secrets = el("div", { class: "secrets" });
    for (let i = 0; i < state.secrets.length; i += 1) {
      secrets.append(
        el("div", { class: "secret" }, [
          `Palavra ${i + 1}: `,
          el("span", { class: "secret-word", text: state.secrets[i].original }),
        ])
      );
    }

    body.append(el("p", { class: "p" }, [`Modo: ${cfg.title}.`]), secrets);
    show(overlay);
    focusFirst();
  }


  function renderConfirm({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel }) {
    const { overlay, body } = modalShell({ title, onClose: onCancel || close });
    body.append(el("p", { class: "p" }, [message || "Confirmar a operacao?"]));
    const actions = el("div", { class: "modal-actions" }, [
      el(
        "button",
        { class: "btn btn--danger", type: "button", onclick: () => onConfirm && onConfirm() },
        [confirmLabel || "Confirmar"]
      ),
      el(
        "button",
        { class: "btn btn--ghost", type: "button", onclick: () => (onCancel ? onCancel() : close()) },
        [cancelLabel || "Cancelar"]
      ),
    ]);
    body.append(actions);
    show(overlay);
    focusFirst();
  }

  function renderProfileSelect({ profiles, currentProfileId, maxProfiles, onSelect, onAddProfile, onSelectMultiplayer }) {
    const { overlay, body } = modalShell({ title: "Selecionar perfil", onClose: close });
    body.append(el("p", { class: "p" }, ["Escolha um perfil para continuar."]));

    function focusNextFocusable(startEl, dir) {
      const focusables = Array.from(overlay.querySelectorAll("button,input,[tabindex='0']"))
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
        });
      const idx = focusables.findIndex((item) => item.el === startEl);
      if (idx === -1) return;
      const nextIdx = dir === "left" ? idx - 1 : idx + 1;
      const target = focusables[nextIdx];
      if (target) target.el.focus();
    }

    function lockableInput(input) {
      input.readOnly = true;
      input.dataset.locked = "1";
      input.onclick = () => {
        if (!input.readOnly) return;
        input.readOnly = false;
        input.dataset.locked = "0";
        input.focus();
        if (typeof input.select === "function") input.select();
      };
      input.onblur = () => {
        input.readOnly = true;
        input.dataset.locked = "1";
      };
    }

    const list = el("div", { class: "profile-grid" });
    (profiles || []).forEach((profile) => {
      const name = String(profile.name || "").trim();
      const initial = name ? name[0].toUpperCase() : "?";
      const btn = el(
        "button",
        {
          class: `profile-card ${profile.id === currentProfileId ? "profile-card--active" : ""}`.trim(),
          type: "button",
          onclick: () => onSelect && onSelect(profile.id),
        },
        [el("div", { class: "profile-avatar", text: initial }), el("div", { class: "profile-card-name", text: name })]
      );
      list.append(btn);
    });
    if (onSelectMultiplayer) {
      const multiCard = el(
        "button",
        {
          class: "profile-card profile-card--multi",
          type: "button",
          onclick: () => onSelectMultiplayer(),
        },
        [el("div", { class: "profile-avatar", text: "2-4" }), el("div", { class: "profile-card-name", text: "Multijogador" })]
      );
      list.append(multiCard);
    }
    const addWrap = el("div", { class: "profile-add" });
    const addCard = el("button", { class: "profile-card profile-card--add", type: "button" }, [
      el("div", { class: "profile-avatar", text: "+" }),
      el("div", { class: "profile-card-name", text: "Adicionar" }),
    ]);
    const nameInput = el("input", {
      class: "input profile-input",
      type: "text",
      placeholder: "Nome do perfil",
      maxlength: "18",
      "aria-label": "Nome do perfil",
      style: "display:none;",
    });
    lockableInput(nameInput);
    nameInput.dataset.focusOrder = "10";
    const createBtn = el(
      "button",
      { class: "btn btn--ghost", type: "button", style: "display:none;", disabled: true },
      ["Criar"]
    );
    createBtn.dataset.focusOrder = "11";
    addCard.onclick = () => {
      nameInput.style.display = "block";
      createBtn.style.display = "inline-flex";
      addCard.style.display = "none";
      nameInput.readOnly = false;
      nameInput.dataset.locked = "0";
      nameInput.focus();
    };
    nameInput.oninput = () => {
      createBtn.disabled = !nameInput.value.trim();
    };
    nameInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        focusNextFocusable(nameInput, "right");
      }
    };
    createBtn.onclick = () => {
      const value = nameInput.value.trim();
      if (!value) return;
      onAddProfile && onAddProfile(value);
    };

    if ((profiles || []).length < maxProfiles) {
      list.append(addCard);
    }
    body.append(list);
    addWrap.append(nameInput, createBtn);
    if ((profiles || []).length >= maxProfiles) {
      addWrap.append(el("div", { class: "profile-limit", text: `Limite de ${maxProfiles} perfis.` }));
    }
    body.append(addWrap);

    show(overlay);
    focusFirst();
  }

  function renderMultiplayerSelect({ profiles, minPlayers = 2, maxPlayers = 4, onStart, onCancel }) {
    const { overlay, body } = modalShell({ title: "Multijogador", onClose: onCancel || close });
    body.append(el("p", { class: "p" }, [`Selecione de ${minPlayers} a ${maxPlayers} perfis.`]));

    const selected = new Set();
    const list = el("div", { class: "profile-grid" });
    const cards = new Map();

    (profiles || []).forEach((profile) => {
      const name = String(profile.name || "").trim();
      const initial = name ? name[0].toUpperCase() : "?";
      const btn = el(
        "button",
        {
          class: "profile-card profile-card--selectable",
          type: "button",
        },
        [el("div", { class: "profile-avatar", text: initial }), el("div", { class: "profile-card-name", text: name })]
      );
      btn.onclick = () => {
        if (selected.has(profile.id)) selected.delete(profile.id);
        else if (selected.size < maxPlayers) selected.add(profile.id);
        update();
      };
      cards.set(profile.id, btn);
      list.append(btn);
    });

    const status = el("div", { class: "multi-select-status", text: "" });
    const startBtn = el("button", { class: "btn", type: "button", disabled: true }, ["Iniciar"]);
    const cancelBtn = el(
      "button",
      { class: "btn btn--ghost", type: "button", onclick: () => (onCancel ? onCancel() : close()) },
      ["Cancelar"]
    );
    startBtn.onclick = () => {
      if (selected.size < minPlayers) return;
      const ordered = (profiles || []).map((p) => p.id).filter((id) => selected.has(id));
      onStart && onStart(ordered);
    };

    function update() {
      for (const [id, btn] of cards.entries()) {
        btn.classList.toggle("profile-card--selected", selected.has(id));
      }
      status.textContent = `Selecionados: ${selected.size}/${maxPlayers}`;
      startBtn.disabled = selected.size < minPlayers;
    }

    update();

    body.append(list, status, el("div", { class: "modal-actions" }, [startBtn, cancelBtn]));
    show(overlay);
    focusFirst();
  }


  function renderWordLengthSelect({ currentLength = WordLengths.five, onSelect, onCancel }) {
    const length = normalizeWordLength(currentLength);
    const { overlay, body } = modalShell({
      title: "Tamanho da palavra",
      onClose: onCancel || close,
    });

    body.append(el("p", { class: "p" }, ["Escolha o tamanho da palavra para jogar."]));

    const list = el("div", { class: "profile-grid" });
    [WordLengths.five, WordLengths.six].forEach((value, idx) => {
      const label = `${value} letras`;
      const btn = el(
        "button",
        {
          class: `profile-card ${value == length ? "profile-card--active" : ""}`.trim(),
          type: "button",
          onclick: () => onSelect && onSelect(value),
        },
        [el("div", { class: "profile-avatar", text: String(value) }), el("div", { class: "profile-card-name", text: label })]
      );
      btn.dataset.focusOrder = String(idx);
      list.append(btn);
    });

    body.append(list);

    if (onCancel) {
      const cancelBtn = el(
        "button",
        { class: "btn btn--ghost", type: "button", onclick: () => onCancel() },
        ["Voltar"]
      );
      body.append(el("div", { class: "modal-actions" }, [cancelBtn]));
    }

    show(overlay);
    focusFirst();
  }
  function renderMultiplayerResult({ mode, outcome, players, onViewPlayer, wordLength }) {
    const cfg = modeConfig(mode, { wordLength });
    const { overlay, body } = modalShell({ title: `Resultado - ${cfg.title}`, onClose: close });
    body.append(el("p", { class: "p" }, [outcome || "Resultado do multijogador."]));

    const list = el("div", { class: "multi-result-list" });
    (players || []).forEach((player) => {
      const statusLabel = player.status === "won" ? "Venceu" : "Perdeu";
      const secretsText = Array.isArray(player.secrets) ? player.secrets.join(", ") : "-";
      list.append(
        el("div", { class: "multi-result-item" }, [
          el("div", { class: "multi-result-row" }, [
            el("div", { class: "multi-result-name", text: player.name }),
            el("div", { class: "multi-result-status", text: statusLabel }),
            el("div", { class: "multi-result-attempts", text: player.attemptsLabel || "-" }),
            el(
              "button",
              {
                class: "btn btn--ghost multi-result-view",
                type: "button",
                onclick: () => onViewPlayer && onViewPlayer(player.id),
              },
              ["Tela cheia"]
            ),
          ]),
          el("div", { class: "multi-result-secrets", text: `Respostas: ${secretsText}` }),
        ])
      );
    });
    body.append(list);
    show(overlay);
    focusFirst();
  }

  return {
    root,
    close,
    isOpen,
    renderHelp,
    renderStats,
    renderSettings,
    renderResult,
    renderProfileSelect,
    renderMultiplayerSelect,
    renderWordLengthSelect,
    renderMultiplayerResult,
    renderConfirm,
  };
}
