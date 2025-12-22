import { loadWordLists } from "./core/wordLists.js";
import { dayIdFromLocalDate, pickDailyModeIndices } from "./core/dailyWord.js";
import { Modes } from "./core/modes.js";
import { createNewGame, addLetter, removeLetter, submitGuess, setMessage } from "./core/gameState.js";
import { loadJSON, saveJSON, remove } from "./core/storage.js";
import { createEmptyStats, recordFinishedGame } from "./core/stats.js";
import { hydrateGame, serializeGame, progressKey, legacyProgressKey } from "./core/persistence.js";
import { createAppUI } from "./ui/appUI.js";

const SETTINGS_KEY = "lgtermo_settings";
const STATS_KEY = "lgtermo_stats";
const SETTINGS_VERSION = 2;
const STATS_VERSION = 2;
const DEFAULT_PROFILE_ID = "tv";
const MAX_PROFILES = 6;

function defaultProfileSettings() {
  return {
    mode: Modes.termo,
    colorblind: false,
    fixedDate: null,
  };
}

function defaultSettingsStore() {
  return {
    version: SETTINGS_VERSION,
    currentProfileId: DEFAULT_PROFILE_ID,
    profiles: [{ id: DEFAULT_PROFILE_ID, name: "TV" }],
    profileSettings: {
      [DEFAULT_PROFILE_ID]: defaultProfileSettings(),
    },
  };
}

function defaultStatsStore() {
  return {
    version: STATS_VERSION,
    profiles: {
      [DEFAULT_PROFILE_ID]: createEmptyStats(),
    },
  };
}

function sanitizeProfileName(value) {
  const name = String(value || "").trim();
  return name.slice(0, 18);
}

function nextProfileId(profiles) {
  const base = Date.now().toString(36);
  let id = `p_${base}`;
  let i = 1;
  const existing = new Set(profiles.map((p) => p.id));
  while (existing.has(id)) {
    id = `p_${base}_${i}`;
    i += 1;
  }
  return id;
}

function parseFixedDate(value) {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function utcMidnight(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function buildDailySecretsByMode({ pool, dayId, seed }) {
  const idx = pickDailyModeIndices({ dayId, seed, length: pool.length });
  return {
    [Modes.termo]: idx.termo.map((i) => pool[i].original),
    [Modes.dueto]: idx.dueto.map((i) => pool[i].original),
    [Modes.quarteto]: idx.quarteto.map((i) => pool[i].original),
  };
}

function safeClipboardWrite(text) {
  if (!navigator.clipboard || !navigator.clipboard.writeText) return Promise.reject(new Error("Clipboard not supported"));
  return navigator.clipboard.writeText(text);
}

async function main() {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root");

  let settingsStore = loadJSON(SETTINGS_KEY, null);
  if (!settingsStore || settingsStore.version !== SETTINGS_VERSION) {
    const next = defaultSettingsStore();
    if (settingsStore && settingsStore.version === 1) {
      next.profileSettings[DEFAULT_PROFILE_ID] = {
        mode: settingsStore.mode || Modes.termo,
        colorblind: !!settingsStore.colorblind,
        fixedDate: settingsStore.fixedDate || null,
      };
    }
    settingsStore = next;
  }
  if (!settingsStore.profileSettings) settingsStore.profileSettings = {};
  if (!Array.isArray(settingsStore.profiles)) settingsStore.profiles = [];

  let statsStore = loadJSON(STATS_KEY, null);
  if (!statsStore || statsStore.version !== STATS_VERSION) {
    const next = defaultStatsStore();
    if (statsStore && statsStore.version === 1) {
      next.profiles[DEFAULT_PROFILE_ID] = statsStore;
    }
    statsStore = next;
  }
  if (!statsStore.profiles) statsStore.profiles = {};

  function ensureProfileSettings(profileId) {
    if (!settingsStore.profileSettings[profileId]) {
      settingsStore.profileSettings[profileId] = defaultProfileSettings();
    }
    return settingsStore.profileSettings[profileId];
  }

  function ensureProfileStats(profileId) {
    if (!statsStore.profiles[profileId]) {
      statsStore.profiles[profileId] = createEmptyStats();
    }
    return statsStore.profiles[profileId];
  }

  function saveSettingsStore() {
    saveJSON(SETTINGS_KEY, settingsStore);
  }

  function saveStatsStore() {
    saveJSON(STATS_KEY, statsStore);
  }

  function profileSeedFor(profileId) {
    const idx = settingsStore.profiles.findIndex((p) => p.id === profileId);
    return idx >= 0 ? idx + 1 : 1;
  }

  if (!Array.isArray(settingsStore.profiles) || settingsStore.profiles.length === 0) {
    settingsStore = defaultSettingsStore();
  }

  if (!settingsStore.currentProfileId) {
    settingsStore.currentProfileId = settingsStore.profiles[0].id;
  }

  settingsStore.profiles.forEach((p) => ensureProfileSettings(p.id));
  if (!settingsStore.profileSettings[settingsStore.currentProfileId]) {
    settingsStore.currentProfileId = settingsStore.profiles[0].id;
  }
  settingsStore.profiles.forEach((p) => ensureProfileStats(p.id));

  saveSettingsStore();
  saveStatsStore();

  let currentProfileId = settingsStore.currentProfileId;
  let settings = ensureProfileSettings(currentProfileId);
  let stats = ensureProfileStats(currentProfileId);
  if (settings.fixedDate) {
    settings.fixedDate = null;
    settingsStore.profileSettings[currentProfileId] = settings;
    saveSettingsStore();
  }

  let lists;
  try {
    lists = await loadWordLists();
  } catch (e) {
    root.textContent = `Erro ao carregar listas locais: ${(e && e.message) || e}`;
    return;
  }

  function currentDayId() {
    const today = new Date();
    const fixed = parseFixedDate(settings.fixedDate);
    if (fixed && utcMidnight(fixed) <= utcMidnight(today)) {
      return dayIdFromLocalDate(fixed);
    }
    return dayIdFromLocalDate(today);
  }

  function newStateForCurrentSettings() {
    const dayId = currentDayId();
    const seed = profileSeedFor(currentProfileId);
    const secretsByMode = buildDailySecretsByMode({ pool: lists.pool, dayId, seed });
    const secretsOriginal = secretsByMode[settings.mode] || secretsByMode[Modes.termo];
    return createNewGame({ mode: settings.mode, dayId, secretsOriginal, seed });
  }

  function loadOrCreateState() {
    const base = newStateForCurrentSettings();
    let saved = loadJSON(
      progressKey({ profileId: currentProfileId, mode: base.mode, dayId: base.dayId, seed: base.seed }),
      null
    );
    if (!saved && currentProfileId === DEFAULT_PROFILE_ID) {
      saved = loadJSON(legacyProgressKey({ mode: base.mode, dayId: base.dayId, seed: base.seed }), null);
    }
    return hydrateGame({ saved, baseState: base });
  }

  let state = loadOrCreateState();
  let lastStatus = state.status;
  let lastRealDayId = dayIdFromLocalDate(new Date());

  const ui = createAppUI({
    root,
    onModeChange: (mode) => {
      settings = { ...settings, mode };
      settingsStore.profileSettings[currentProfileId] = settings;
      saveSettingsStore();
      state = loadOrCreateState();
      lastStatus = state.status;
      ui.render(state, { settings });
      ui.initialFocus();
      persist();

      if (state.status !== "playing") showResultModal();
    },
    onTopAction: (action) => {
      if (action === "help") ui.modal.renderHelp();
      else if (action === "stats")
        ui.modal.renderStats({
          statsStore,
          profiles: settingsStore.profiles,
          currentProfileId,
          mode: state.mode,
        });
      else if (action === "settings") openSettingsModal();
      else if (action === "exit") exitApp();
    },
    onKeyboardAction: (action) => {
      if (action.type === "letter") {
        state = addLetter(state, action.letter);
        ui.render(state, { settings });
        persist();
      } else if (action.type === "back") {
        state = removeLetter(state);
        ui.render(state, { settings });
        persist();
      } else if (action.type === "enter") {
        doSubmit();
      }
    },
    onSubmitFromPhysicalEnter: () => doSubmit(),
    onBackFromPhysical: () => {
      if (ui.modal.isOpen()) ui.modal.close();
      else {
        state = removeLetter(state);
        ui.render(state, { settings });
        persist();
      }
    },
    onLetterFromPhysical: (letter) => {
      state = addLetter(state, letter);
      ui.render(state, { settings });
      persist();
    },
    onModalRequestClose: () => ui.initialFocus(),
  });

  function setCurrentProfile(profileId) {
    currentProfileId = profileId;
    settingsStore.currentProfileId = profileId;
    settings = ensureProfileSettings(profileId);
    stats = ensureProfileStats(profileId);
    saveSettingsStore();
    saveStatsStore();
    state = loadOrCreateState();
    lastStatus = state.status;
    ui.render(state, { settings });
    ui.initialFocus();
    persist();
    if (state.status !== "playing") showResultModal();
  }

  function openProfileSelect() {
    ui.modal.renderProfileSelect({
      profiles: settingsStore.profiles,
      currentProfileId,
      maxProfiles: MAX_PROFILES,
      onSelect: (profileId) => {
        ui.modal.close();
        setCurrentProfile(profileId);
      },
      onAddProfile: (name) => {
        const trimmed = sanitizeProfileName(name);
        if (!trimmed || settingsStore.profiles.length >= MAX_PROFILES) return;
        const id = nextProfileId(settingsStore.profiles);
        settingsStore.profiles.push({ id, name: trimmed });
        settingsStore.profileSettings[id] = defaultProfileSettings();
        statsStore.profiles[id] = createEmptyStats();
        saveSettingsStore();
        saveStatsStore();
        ui.modal.close();
        setCurrentProfile(id);
      },
    });
  }

  function openSettingsModal() {
    ui.modal.renderSettings({
      settings,
      profiles: settingsStore.profiles,
      currentProfileId,
      maxProfiles: MAX_PROFILES,
      defaultProfileId: DEFAULT_PROFILE_ID,
      onUpdateSettings: (patch) => {
        settings = { ...settings, ...patch };
        settingsStore.profileSettings[currentProfileId] = settings;
        saveSettingsStore();

        // Rebuild state when date changes, because the daily selection changes.
        state = loadOrCreateState();
        lastStatus = state.status;
        ui.render(state, { settings });
        persist();

        if (state.status !== "playing") showResultModal();
      },
      onResetToday: () => {
        ui.modal.renderConfirm({
          title: "Apagar progresso",
          message: "Tem certeza? Isso apaga o progresso de hoje deste perfil.",
          confirmLabel: "Apagar",
          cancelLabel: "Cancelar",
          onConfirm: () => {
            const dayId = currentDayId();
            const seed = profileSeedFor(currentProfileId);
            remove(progressKey({ profileId: currentProfileId, mode: settings.mode, dayId, seed }));
            if (currentProfileId === DEFAULT_PROFILE_ID) {
              remove(legacyProgressKey({ mode: settings.mode, dayId, seed }));
            }
            state = loadOrCreateState();
            lastStatus = state.status;
            ui.render(state, { settings });
            persist();
            ui.modal.close();
          },
          onCancel: () => openSettingsModal(),
        });
      },
      onResetAll: () => {
        ui.modal.renderConfirm({
          title: "Apagar tudo",
          message: "Tem certeza? Isso apaga todos os perfis, stats e progresso.",
          confirmLabel: "Apagar tudo",
          cancelLabel: "Cancelar",
          onConfirm: () => {
            try {
              localStorage.clear();
            } catch {
              // ignore
            }
            settingsStore = defaultSettingsStore();
            statsStore = defaultStatsStore();
            currentProfileId = settingsStore.currentProfileId;
            settings = ensureProfileSettings(currentProfileId);
            stats = ensureProfileStats(currentProfileId);
            saveSettingsStore();
            saveStatsStore();
            state = loadOrCreateState();
            lastStatus = state.status;
            ui.render(state, { settings });
            persist();
            ui.modal.close();
          },
          onCancel: () => openSettingsModal(),
        });
      },
      onSelectProfile: () => {
        openProfileSelect();
      },
      onRenameProfile: (profileId, name) => {
        const trimmed = sanitizeProfileName(name);
        if (!trimmed) return;
        const target = settingsStore.profiles.find((p) => p.id === profileId);
        if (!target) return;
        target.name = trimmed;
        saveSettingsStore();
        openSettingsModal();
      },
      onDeleteProfile: (profileId) => {
        if (profileId === DEFAULT_PROFILE_ID) return;
        ui.modal.renderConfirm({
          title: "Excluir perfil",
          message: "Tem certeza? Essa acao remove estatisticas e progresso desse perfil.",
          confirmLabel: "Excluir",
          cancelLabel: "Cancelar",
          onConfirm: () => {
            if (settingsStore.profiles.length <= 1) return;
            const idx = settingsStore.profiles.findIndex((p) => p.id === profileId);
            if (idx === -1) return;
            settingsStore.profiles.splice(idx, 1);
            delete settingsStore.profileSettings[profileId];
            delete statsStore.profiles[profileId];
            if (currentProfileId === profileId) {
              const fallback = settingsStore.profiles[0].id;
              currentProfileId = fallback;
              settingsStore.currentProfileId = fallback;
              settings = ensureProfileSettings(fallback);
              stats = ensureProfileStats(fallback);
              state = loadOrCreateState();
              lastStatus = state.status;
              ui.render(state, { settings });
              persist();
            }
            saveSettingsStore();
            saveStatsStore();
            openSettingsModal();
          },
          onCancel: () => openSettingsModal(),
        });
      },
    });
  }

  function exitApp() {
    if (window.PalmSystem && typeof window.PalmSystem.platformBack === "function") {
      window.PalmSystem.platformBack();
      return;
    }
    if (window.PalmSystem && typeof window.PalmSystem.exit === "function") {
      window.PalmSystem.exit();
      return;
    }
    window.close();
  }

  function persist() {
    saveJSON(
      progressKey({ profileId: currentProfileId, mode: state.mode, dayId: state.dayId, seed: state.seed }),
      serializeGame(state)
    );
  }

  function showResultModal() {
    const show = () =>
      ui.modal.renderResult({
        state,
        onShowQr: (text) => ui.modal.renderQr({ text, onCloseQr: show }),
        onCopy: (text) => {
          safeClipboardWrite(text)
            .then(() => {
              state = setMessage(state, "Texto copiado.");
              ui.render(state, { settings });
            })
            .catch(() => {
              state = setMessage(state, "Nao foi possivel copiar.");
              ui.render(state, { settings });
            });
        },
      });

    show();
  }

  function doSubmit() {
    const before = state;
    state = submitGuess(state, { dictionarySet: lists.dictionarySet });

    if (state !== before && state.guesses.length > before.guesses.length) {
      ui.setRevealRowIndex(state.guesses.length - 1);
    }

    ui.render(state, { settings });
    persist();

    if (lastStatus === "playing" && (state.status === "won" || state.status === "lost")) {
      stats = recordFinishedGame(stats, state);
      statsStore.profiles[currentProfileId] = stats;
      saveStatsStore();
      showResultModal();
    }

    lastStatus = state.status;
  }

  ui.render(state, { settings });
  ui.initialFocus();
  persist();
  openProfileSelect();

  if (state.status !== "playing" && !ui.modal.isOpen()) showResultModal();

  setInterval(() => {
    const nowRealDayId = dayIdFromLocalDate(new Date());
    if (nowRealDayId === lastRealDayId) return;
    lastRealDayId = nowRealDayId;
    settings.fixedDate = null;
    settingsStore.profileSettings[currentProfileId] = settings;
    saveSettingsStore();
    state = loadOrCreateState();
    lastStatus = state.status;
    ui.render(state, { settings });
    persist();
    if (state.status !== "playing") showResultModal();
  }, 60 * 1000);
}

main().catch((e) => {
  console.error(e);
  const root = document.getElementById("root");
  if (root) root.textContent = `Erro: ${(e && e.message) || e}`;
});
