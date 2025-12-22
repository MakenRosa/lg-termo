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
const SETTINGS_VERSION = 3;
const STATS_VERSION = 3;
const DEFAULT_PROFILE_ID = "tv";
const MAX_PROFILES = 6;
const MULTI_MIN_PLAYERS = 2;
const MULTI_MAX_PLAYERS = 4;
const MULTI_SEED_OFFSET = 1000;
const MULTI_GROUP_STRIDE = 97;
const SINGLE_VARIANT = "single";
const MULTI_VARIANT = "multi";

function defaultProfileSettings() {
  return {
    mode: Modes.termo,
    colorblind: false,
    fixedDate: null,
  };
}

function defaultMultiSettings() {
  return defaultProfileSettings();
}

function defaultSettingsStore() {
  return {
    version: SETTINGS_VERSION,
    currentProfileId: DEFAULT_PROFILE_ID,
    profiles: [{ id: DEFAULT_PROFILE_ID, name: "TV" }],
    profileSettings: {
      [DEFAULT_PROFILE_ID]: defaultProfileSettings(),
    },
    multiSettings: defaultMultiSettings(),
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
  const dt = new Date(y, mo, d);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

function localMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function buildDailySecretsByMode({ pool, dayId, seed }) {
  const idx = pickDailyModeIndices({ dayId, seed, length: pool.length });
  return {
    [Modes.termo]: idx.termo.map((i) => pool[i].original),
    [Modes.dueto]: idx.dueto.map((i) => pool[i].original),
    [Modes.quarteto]: idx.quarteto.map((i) => pool[i].original),
  };
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
    } else if (settingsStore && settingsStore.version === 2) {
      next.currentProfileId = settingsStore.currentProfileId || next.currentProfileId;
      next.profiles = Array.isArray(settingsStore.profiles) && settingsStore.profiles.length
        ? settingsStore.profiles
        : next.profiles;
      next.profileSettings = settingsStore.profileSettings || next.profileSettings;
    }
    settingsStore = next;
  }
  if (!settingsStore.profileSettings) settingsStore.profileSettings = {};
  if (!Array.isArray(settingsStore.profiles)) settingsStore.profiles = [];
  if (!settingsStore.multiSettings) settingsStore.multiSettings = defaultMultiSettings();

  let statsStore = loadJSON(STATS_KEY, null);
  if (!statsStore || statsStore.version !== STATS_VERSION) {
    const next = defaultStatsStore();
    if (statsStore && statsStore.version === 1) {
      next.profiles[DEFAULT_PROFILE_ID] = statsStore;
    } else if (statsStore && statsStore.version === 2) {
      next.profiles = statsStore.profiles || next.profiles;
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

  function ensureMultiSettings() {
    if (!settingsStore.multiSettings) settingsStore.multiSettings = defaultMultiSettings();
    return settingsStore.multiSettings;
  }

  function ensureProfileStats(profileId) {
    if (!statsStore.profiles[profileId]) {
      statsStore.profiles[profileId] = createEmptyStats();
    }
    const profileStats = statsStore.profiles[profileId];
    const defaults = createEmptyStats();
    [Modes.termo, Modes.dueto, Modes.quarteto].forEach((mode) => {
      if (!profileStats[mode]) profileStats[mode] = defaults[mode];
      if (!profileStats[mode].resultsByGameKey) profileStats[mode].resultsByGameKey = {};
      if (!profileStats[mode].resultsByDayId) profileStats[mode].resultsByDayId = {};
    });
    return profileStats;
  }

  function saveSettingsStore() {
    saveJSON(SETTINGS_KEY, settingsStore);
  }

  function saveStatsStore() {
    saveJSON(STATS_KEY, statsStore);
  }

  function clearProfileProgress(profileId) {
    const prefix = `lgtermo_progress_${profileId}_`;
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) keys.push(key);
      }
    } catch {
      return;
    }
    keys.forEach((key) => remove(key));
  }

  function profileSeedIndex(profileId) {
    return settingsStore.profiles.findIndex((p) => p.id === profileId);
  }

  function profileSeedFor(profileId) {
    const idx = profileSeedIndex(profileId);
    return idx >= 0 ? idx + 1 : 1;
  }

  function multiplayerGroupSeed(profileIds) {
    if (!Array.isArray(profileIds)) return 0;
    let mask = 0;
    profileIds.forEach((id) => {
      const idx = profileSeedIndex(id);
      if (idx >= 0 && idx < 30) mask |= 1 << idx;
    });
    return mask >>> 0;
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
  let multiSettings = ensureMultiSettings();
  let stats = ensureProfileStats(currentProfileId);
  if (settings.fixedDate) {
    settings.fixedDate = null;
    settingsStore.profileSettings[currentProfileId] = settings;
    saveSettingsStore();
  }
  if (multiSettings.fixedDate) {
    multiSettings.fixedDate = null;
    settingsStore.multiSettings = multiSettings;
    saveSettingsStore();
  }

  let lists;
  try {
    lists = await loadWordLists();
  } catch (e) {
    root.textContent = `Erro ao carregar listas locais: ${(e && e.message) || e}`;
    return;
  }

  function currentDayIdFor(settingsRef) {
    const today = new Date();
    const fixed = parseFixedDate(settingsRef.fixedDate);
    if (fixed && localMidnight(fixed) <= localMidnight(today)) {
      return dayIdFromLocalDate(fixed);
    }
    return dayIdFromLocalDate(today);
  }

  function hasOverlapIndices(indicesByMode, avoidSet) {
    const all = indicesByMode.termo.concat(indicesByMode.dueto, indicesByMode.quarteto);
    return all.some((idx) => avoidSet.has(idx));
  }

  function multiplayerSeedFor(profileId, dayId, groupSeed = 0) {
    const profileSeed = profileSeedFor(profileId);
    const baseSeed = profileSeed + MULTI_SEED_OFFSET + groupSeed * MULTI_GROUP_STRIDE;
    const singleSeed = profileSeed;
    const length = lists.pool.length;
    const singleIdx = pickDailyModeIndices({ dayId, seed: singleSeed, length });
    const avoid = new Set(singleIdx.termo.concat(singleIdx.dueto, singleIdx.quarteto));
    let seed = baseSeed;
    for (let i = 0; i < 50; i += 1) {
      const multiIdx = pickDailyModeIndices({ dayId, seed, length });
      if (!hasOverlapIndices(multiIdx, avoid)) return seed;
      seed += MULTI_GROUP_STRIDE;
    }
    return baseSeed;
  }

  function newStateForProfile({ profileId, settingsRef, variant, groupSeed = 0 }) {
    const dayId = currentDayIdFor(settingsRef);
    const seed =
      variant === MULTI_VARIANT ? multiplayerSeedFor(profileId, dayId, groupSeed) : profileSeedFor(profileId);
    const secretsByMode = buildDailySecretsByMode({ pool: lists.pool, dayId, seed });
    const secretsOriginal = secretsByMode[settingsRef.mode] || secretsByMode[Modes.termo];
    return createNewGame({ mode: settingsRef.mode, dayId, secretsOriginal, seed, variant });
  }

  function loadOrCreateStateForProfile({ profileId, settingsRef, variant, groupSeed = 0 }) {
    const base = newStateForProfile({ profileId, settingsRef, variant, groupSeed });
    let saved = loadJSON(
      progressKey({ profileId, mode: base.mode, dayId: base.dayId, seed: base.seed }),
      null
    );
    if (!saved && variant === SINGLE_VARIANT && profileId === DEFAULT_PROFILE_ID) {
      saved = loadJSON(legacyProgressKey({ mode: base.mode, dayId: base.dayId, seed: base.seed }), null);
    }
    return hydrateGame({ saved, baseState: base });
  }

  let multiplayer = null;
  let viewer = null;
  let turnLock = false;
  let turnTimer = null;
  let state = loadOrCreateStateForProfile({
    profileId: currentProfileId,
    settingsRef: settings,
    variant: SINGLE_VARIANT,
  });
  let lastStatus = state.status;
  let lastRealDayId = dayIdFromLocalDate(new Date());

  const ui = createAppUI({
    root,
    onModeChange: (mode) => {
      if (isViewerActive()) {
        closeViewer({ returnToModal: false });
      }
      if (multiplayer) {
        multiSettings = { ...multiSettings, mode };
        settingsStore.multiSettings = multiSettings;
        saveSettingsStore();
        rebuildMultiplayerStates();
        renderActiveState();
        if (allMultiplayerFinished()) showMultiplayerResult();
      } else {
        settings = { ...settings, mode };
        settingsStore.profileSettings[currentProfileId] = settings;
        saveSettingsStore();
        state = loadOrCreateStateForProfile({
          profileId: currentProfileId,
          settingsRef: settings,
          variant: SINGLE_VARIANT,
        });
        lastStatus = state.status;
        renderActiveState();
        persistActiveState();

        if (state.status !== "playing") showResultModal();
      }
    },
    onTopAction: (action) => {
      if (isViewerActive() && action !== "exit") {
        closeViewer({ returnToModal: false });
      }
      if (action === "help") ui.modal.renderHelp();
      else if (action === "stats")
        ui.modal.renderStats({
          statsStore,
          profiles: settingsStore.profiles,
          currentProfileId: activeProfileId(),
          mode: state.mode,
        });
      else if (action === "settings") openSettingsModal();
      else if (action === "exit") exitApp();
    },
    onKeyboardAction: (action) => {
      if (isViewerActive()) return;
      if (turnLock) return;
      if (action.type === "letter") {
        state = addLetter(state, action.letter);
        updateActiveState(state);
        renderActiveState();
        persistActiveState();
      } else if (action.type === "back") {
        state = removeLetter(state);
        updateActiveState(state);
        renderActiveState();
        persistActiveState();
      } else if (action.type === "enter") {
        doSubmit();
      }
    },
    onSubmitFromPhysicalEnter: () => {
      if (isViewerActive()) return;
      doSubmit();
    },
    onBackFromPhysical: () => {
      if (isViewerActive()) {
        closeViewer({ returnToModal: true });
        return;
      }
      if (ui.modal.isOpen()) ui.modal.close();
      else {
        if (turnLock) return;
        state = removeLetter(state);
        updateActiveState(state);
        renderActiveState();
        persistActiveState();
      }
    },
    onLetterFromPhysical: (letter) => {
      if (isViewerActive()) return;
      if (turnLock) return;
      state = addLetter(state, letter);
      updateActiveState(state);
      renderActiveState();
      persistActiveState();
    },
    onViewerAction: (action) => {
      if (!isViewerActive()) return;
      if (action === "close") {
        closeViewer({ returnToModal: true });
      } else if (action === "prev") {
        moveViewer(-1);
      } else if (action === "next") {
        moveViewer(1);
      }
    },
    onModalRequestClose: () => ui.initialFocus(),
  });

  function activeMode() {
    return multiplayer ? multiSettings.mode : settings.mode;
  }

  function currentIndexForMode(mode) {
    if (!multiplayer) return 0;
    if (!multiplayer.currentIndexByMode) multiplayer.currentIndexByMode = {};
    const idx = multiplayer.currentIndexByMode[mode];
    if (Number.isInteger(idx)) return idx;
    multiplayer.currentIndexByMode[mode] = 0;
    return 0;
  }

  function setIndexForMode(mode, idx) {
    if (!multiplayer) return;
    if (!multiplayer.currentIndexByMode) multiplayer.currentIndexByMode = {};
    multiplayer.currentIndexByMode[mode] = idx;
  }

  function activeProfileId(modeOverride) {
    if (multiplayer && multiplayer.profileIds.length > 0) {
      const mode = modeOverride || activeMode();
      const idx = currentIndexForMode(mode);
      return multiplayer.profileIds[idx] || multiplayer.profileIds[0];
    }
    return currentProfileId;
  }

  function activeSettingsRef() {
    return multiplayer ? multiSettings : settings;
  }

  function isViewerActive() {
    return !!viewer;
  }

  function viewerProfileId() {
    if (!viewer || !multiplayer) return null;
    const ids = multiplayer.profileIds;
    return ids[viewer.index] || ids[0] || null;
  }

  function viewerState() {
    if (!viewer || !multiplayer) return null;
    const profileId = viewerProfileId();
    return profileId ? multiplayer.states[profileId] : null;
  }

  function viewerInfo() {
    if (!viewer || !multiplayer) return null;
    const profileId = viewerProfileId();
    const profile = settingsStore.profiles.find((p) => p.id === profileId);
    return {
      name: profile ? profile.name : "Perfil",
      index: viewer.index + 1,
      total: multiplayer.profileIds.length,
    };
  }

  function activePlayerInfo() {
    if (!multiplayer) return null;
    const mode = activeMode();
    const profileId = activeProfileId(mode);
    const profile = settingsStore.profiles.find((p) => p.id === profileId);
    return {
      name: profile ? profile.name : "Perfil",
      index: currentIndexForMode(mode) + 1,
      total: multiplayer.profileIds.length,
    };
  }

  function updateActiveState(nextState) {
    if (multiplayer) {
      const profileId = activeProfileId();
      multiplayer.states[profileId] = nextState;
    }
    state = nextState;
  }

  function persistState(profileId, nextState) {
    saveJSON(
      progressKey({ profileId, mode: nextState.mode, dayId: nextState.dayId, seed: nextState.seed }),
      serializeGame(nextState)
    );
  }

  function persistActiveState() {
    const profileId = activeProfileId();
    persistState(profileId, state);
  }

  function renderActiveState({ focus = true } = {}) {
    const activeViewer = isViewerActive();
    const renderState = activeViewer ? viewerState() || state : state;
    const player = activeViewer ? null : activePlayerInfo();
    ui.render(renderState, { settings: activeSettingsRef(), player, viewer: viewerInfo() });
    if (focus && !ui.modal.isOpen()) ui.initialFocus();
  }

  function findNextPlayableIndex(startIndex, { includeCurrent = false } = {}) {
    const ids = multiplayer ? multiplayer.profileIds : [];
    if (ids.length === 0) return null;
    const total = ids.length;
    const startOffset = includeCurrent ? 0 : 1;
    for (let offset = startOffset; offset < total + startOffset; offset += 1) {
      const idx = (startIndex + offset) % total;
      const st = multiplayer.states[ids[idx]];
      if (st && st.status === "playing") return idx;
    }
    return null;
  }

  function allMultiplayerFinished() {
    if (!multiplayer) return false;
    return multiplayer.profileIds.every((id) => {
      const st = multiplayer.states[id];
      return st && st.status !== "playing";
    });
  }

  function syncStatsForState(profileId, playerState) {
    if (playerState.status !== "won" && playerState.status !== "lost") return;
    const profileStats = ensureProfileStats(profileId);
    const updated = recordFinishedGame(profileStats, playerState);
    statsStore.profiles[profileId] = updated;
    saveStatsStore();
    if (profileId === currentProfileId) stats = updated;
  }

  function rebuildMultiplayerStates() {
    if (!multiplayer) return;
    multiplayer.groupSeed = multiplayerGroupSeed(multiplayer.profileIds);
    multiplayer.resultShown = false;
    const states = {};
    multiplayer.profileIds.forEach((profileId) => {
      states[profileId] = loadOrCreateStateForProfile({
        profileId,
        settingsRef: multiSettings,
        variant: MULTI_VARIANT,
        groupSeed: multiplayer.groupSeed,
      });
      syncStatsForState(profileId, states[profileId]);
    });
    multiplayer.states = states;
    const mode = activeMode();
    const startIndex = currentIndexForMode(mode);
    const nextIndex = findNextPlayableIndex(startIndex, { includeCurrent: true });
    setIndexForMode(mode, nextIndex == null ? 0 : nextIndex);
    state = multiplayer.states[activeProfileId(mode)];
    turnLock = false;
    if (turnTimer) {
      clearTimeout(turnTimer);
      turnTimer = null;
    }
  }

  function stopMultiplayer() {
    multiplayer = null;
    turnLock = false;
    viewer = null;
    if (turnTimer) {
      clearTimeout(turnTimer);
      turnTimer = null;
    }
  }

  function moveViewer(delta) {
    if (!viewer || !multiplayer) return;
    const total = multiplayer.profileIds.length;
    if (total === 0) return;
    viewer.index = (viewer.index + delta + total) % total;
    renderActiveState();
  }

  function openViewer(profileId) {
    if (!multiplayer) return;
    const ids = multiplayer.profileIds;
    let idx = ids.indexOf(profileId);
    if (idx < 0) idx = 0;
    viewer = { index: idx };
    renderActiveState();
  }

  function closeViewer({ returnToModal } = {}) {
    if (!viewer) return;
    const shouldReturn = returnToModal !== false;
    viewer = null;
    renderActiveState();
    if (shouldReturn) {
      renderMultiplayerResult({ force: true });
    }
  }

  function advanceMultiplayerTurn() {
    if (!multiplayer) return;
    if (allMultiplayerFinished()) {
      showMultiplayerResult();
      return;
    }
    const mode = activeMode();
    const startIndex = currentIndexForMode(mode);
    const nextIndex = findNextPlayableIndex(startIndex);
    if (nextIndex == null) {
      renderActiveState();
      return;
    }
    setIndexForMode(mode, nextIndex);
    state = multiplayer.states[activeProfileId(mode)];
    renderActiveState();
    persistActiveState();
  }

  function scheduleAdvanceTurn() {
    if (!multiplayer) return;
    const delay = 1200;
    turnLock = true;
    if (turnTimer) clearTimeout(turnTimer);
    turnTimer = setTimeout(() => {
      turnLock = false;
      advanceMultiplayerTurn();
    }, delay);
  }

  function setCurrentProfile(profileId) {
    stopMultiplayer();
    currentProfileId = profileId;
    settingsStore.currentProfileId = profileId;
    settings = ensureProfileSettings(profileId);
    stats = ensureProfileStats(profileId);
    saveSettingsStore();
    saveStatsStore();
    state = loadOrCreateStateForProfile({
      profileId: currentProfileId,
      settingsRef: settings,
      variant: SINGLE_VARIANT,
    });
    lastStatus = state.status;
    renderActiveState();
    persistActiveState();
    if (state.status !== "playing") showResultModal();
  }

  function openProfileSelect() {
    ui.modal.renderProfileSelect({
      profiles: settingsStore.profiles,
      currentProfileId: activeProfileId(),
      maxProfiles: MAX_PROFILES,
      onSelect: (profileId) => {
        ui.modal.close();
        setCurrentProfile(profileId);
      },
      onSelectMultiplayer: () => {
        if (settingsStore.profiles.length < MULTI_MIN_PLAYERS) {
          ui.modal.renderConfirm({
            title: "Multijogador",
            message: "Crie pelo menos 2 perfis para jogar no multijogador.",
            confirmLabel: "Ok",
            cancelLabel: "Fechar",
            onConfirm: () => openProfileSelect(),
            onCancel: () => openProfileSelect(),
          });
          return;
        }
        openMultiplayerSelect();
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

  function openMultiplayerSelect() {
    ui.modal.renderMultiplayerSelect({
      profiles: settingsStore.profiles,
      minPlayers: MULTI_MIN_PLAYERS,
      maxPlayers: MULTI_MAX_PLAYERS,
      onStart: (profileIds) => {
        ui.modal.close();
        startMultiplayer(profileIds);
      },
      onCancel: () => openProfileSelect(),
    });
  }

  function startMultiplayer(profileIds) {
    stopMultiplayer();
    const available = new Set(settingsStore.profiles.map((p) => p.id));
    const selected = Array.from(new Set(profileIds)).filter((id) => available.has(id));
    if (selected.length < MULTI_MIN_PLAYERS) return;
    multiplayer = {
      profileIds: selected.slice(0, MULTI_MAX_PLAYERS),
      currentIndexByMode: {
        [Modes.termo]: 0,
        [Modes.dueto]: 0,
        [Modes.quarteto]: 0,
      },
      states: {},
      resultShown: false,
    };
    multiplayer.groupSeed = multiplayerGroupSeed(multiplayer.profileIds);
    rebuildMultiplayerStates();
    renderActiveState();
    persistActiveState();
    if (allMultiplayerFinished()) showMultiplayerResult();
  }

  function openSettingsModal() {
    const settingsRef = activeSettingsRef();
    const activeId = activeProfileId();
    ui.modal.renderSettings({
      settings: settingsRef,
      profiles: settingsStore.profiles,
      currentProfileId: activeId,
      maxProfiles: MAX_PROFILES,
      defaultProfileId: DEFAULT_PROFILE_ID,
      onUpdateSettings: (patch) => {
        if (multiplayer) {
          multiSettings = { ...multiSettings, ...patch };
          settingsStore.multiSettings = multiSettings;
          saveSettingsStore();
          rebuildMultiplayerStates();
          renderActiveState();
          persistActiveState();
          if (allMultiplayerFinished()) showMultiplayerResult();
        } else {
          settings = { ...settings, ...patch };
          settingsStore.profileSettings[currentProfileId] = settings;
          saveSettingsStore();

          // Rebuild state when date changes, because the daily selection changes.
          state = loadOrCreateStateForProfile({
            profileId: currentProfileId,
            settingsRef: settings,
            variant: SINGLE_VARIANT,
          });
          lastStatus = state.status;
          renderActiveState();
          persistActiveState();

          if (state.status !== "playing") showResultModal();
        }
      },
      onResetToday: () => {
        ui.modal.renderConfirm({
          title: "Apagar progresso",
          message: "Tem certeza? Isso apaga o progresso de hoje deste perfil.",
          confirmLabel: "Apagar",
          cancelLabel: "Cancelar",
          onConfirm: () => {
            const profileId = activeProfileId();
            remove(progressKey({ profileId, mode: state.mode, dayId: state.dayId, seed: state.seed }));
            if (!multiplayer && profileId === DEFAULT_PROFILE_ID) {
              remove(legacyProgressKey({ mode: state.mode, dayId: state.dayId, seed: state.seed }));
            }
            if (multiplayer) {
              rebuildMultiplayerStates();
              renderActiveState();
              persistActiveState();
              if (allMultiplayerFinished()) showMultiplayerResult();
            } else {
              state = loadOrCreateStateForProfile({
                profileId: currentProfileId,
                settingsRef: settings,
                variant: SINGLE_VARIANT,
              });
              lastStatus = state.status;
              renderActiveState();
              persistActiveState();
            }
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
            multiSettings = ensureMultiSettings();
            stats = ensureProfileStats(currentProfileId);
            saveSettingsStore();
            saveStatsStore();
            stopMultiplayer();
            state = loadOrCreateStateForProfile({
              profileId: currentProfileId,
              settingsRef: settings,
              variant: SINGLE_VARIANT,
            });
            lastStatus = state.status;
            renderActiveState();
            persistActiveState();
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
            const wasMultiplayer = !!multiplayer;
            clearProfileProgress(profileId);
            settingsStore.profiles.splice(idx, 1);
            delete settingsStore.profileSettings[profileId];
            delete statsStore.profiles[profileId];
            if (wasMultiplayer) stopMultiplayer();
            if (currentProfileId === profileId || !settingsStore.profileSettings[currentProfileId]) {
              const fallback = settingsStore.profiles[0].id;
              currentProfileId = fallback;
              settingsStore.currentProfileId = fallback;
              settings = ensureProfileSettings(fallback);
              stats = ensureProfileStats(fallback);
              state = loadOrCreateStateForProfile({
                profileId: currentProfileId,
                settingsRef: settings,
                variant: SINGLE_VARIANT,
              });
              lastStatus = state.status;
              renderActiveState();
              persistActiveState();
            } else if (wasMultiplayer) {
              state = loadOrCreateStateForProfile({
                profileId: currentProfileId,
                settingsRef: settings,
                variant: SINGLE_VARIANT,
              });
              lastStatus = state.status;
              renderActiveState();
              persistActiveState();
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

  function showResultModal() {
    const show = () =>
      ui.modal.renderResult({
        state,
      });

    show();
  }

  function attemptsUsedForState(playerState) {
    if (playerState.status === "won") {
      const solved = playerState.solvedAt.filter((v) => v != null);
      return solved.length ? Math.max(...solved) : playerState.maxAttempts;
    }
    return playerState.maxAttempts;
  }

  function buildMultiplayerResultData() {
    const players = multiplayer.profileIds.map((profileId) => {
      const profile = settingsStore.profiles.find((p) => p.id === profileId);
      const playerState = multiplayer.states[profileId];
      const attempts = attemptsUsedForState(playerState);
      return {
        id: profileId,
        name: profile ? profile.name : "Perfil",
        status: playerState.status,
        attempts,
        attemptsLabel: playerState.status === "won" ? `${attempts}/${playerState.maxAttempts}` : `X/${playerState.maxAttempts}`,
        secrets: playerState.secrets.map((s) => s.original),
      };
    });
    const winners = players.filter((p) => p.status === "won");
    let outcome = "Empate";
    if (winners.length > 0) {
      const best = Math.min(...winners.map((p) => p.attempts));
      const top = winners.filter((p) => p.attempts === best);
      if (top.length === 1) {
        outcome = `Vencedor: ${top[0].name}`;
      } else {
        outcome = `Empate: ${top.map((p) => p.name).join(", ")}`;
      }
    }
    return { players, outcome };
  }

  function renderMultiplayerResult({ force } = {}) {
    if (!multiplayer) return;
    const { players, outcome } = buildMultiplayerResultData();
    ui.modal.renderMultiplayerResult({
      mode: state.mode,
      outcome,
      players,
      onViewPlayer: (profileId) => {
        ui.modal.close();
        openViewer(profileId);
      },
    });
    if (!force) multiplayer.resultShown = true;
  }

  function showMultiplayerResult() {
    if (!multiplayer || multiplayer.resultShown) return;
    renderMultiplayerResult();
  }

  function doSubmit() {
    if (isViewerActive()) return;
    if (turnLock) return;
    const before = state;
    const next = submitGuess(state, { dictionarySet: lists.dictionarySet });
    const guessApplied = next.guesses.length > before.guesses.length;

    if (guessApplied) {
      ui.setRevealRowIndex(next.guesses.length - 1);
    }

    updateActiveState(next);
    renderActiveState();
    persistActiveState();

    if (before.status === "playing" && (next.status === "won" || next.status === "lost")) {
      syncStatsForState(activeProfileId(), next);
    }

    if (multiplayer) {
      if (guessApplied) scheduleAdvanceTurn();
      return;
    }

    if (lastStatus === "playing" && (state.status === "won" || state.status === "lost")) {
      showResultModal();
    }

    lastStatus = state.status;
  }

  renderActiveState();
  persistActiveState();
  openProfileSelect();

  if (state.status !== "playing" && !ui.modal.isOpen()) showResultModal();

  setInterval(() => {
    const nowRealDayId = dayIdFromLocalDate(new Date());
    if (nowRealDayId === lastRealDayId) return;
    lastRealDayId = nowRealDayId;
    if (multiplayer) {
      multiSettings.fixedDate = null;
      settingsStore.multiSettings = multiSettings;
      saveSettingsStore();
      rebuildMultiplayerStates();
      renderActiveState();
      persistActiveState();
      if (allMultiplayerFinished()) showMultiplayerResult();
    } else {
      settings.fixedDate = null;
      settingsStore.profileSettings[currentProfileId] = settings;
      saveSettingsStore();
      state = loadOrCreateStateForProfile({
        profileId: currentProfileId,
        settingsRef: settings,
        variant: SINGLE_VARIANT,
      });
      lastStatus = state.status;
      renderActiveState();
      persistActiveState();
      if (state.status !== "playing") showResultModal();
    }
  }, 60 * 1000);
}

main().catch((e) => {
  console.error(e);
  const root = document.getElementById("root");
  if (root) root.textContent = `Erro: ${(e && e.message) || e}`;
});
