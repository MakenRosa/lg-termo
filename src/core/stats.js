import { modeConfig, modeKey, normalizeWordLength, WordLengths } from "./modes.js";

export function createEmptyStats() {
  return {
    version: 1,
    termo: emptyModeStats(),
    dueto: emptyModeStats(),
    quarteto: emptyModeStats(),
    termo6: emptyModeStats(),
    dueto6: emptyModeStats(),
    quarteto6: emptyModeStats(),
  };
}

function emptyModeStats() {
  return {
    played: 0,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastPlayedDayId: null,
    lastWinDayId: null,
    distribution: {}, // key: attemptsUsed -> count
    resultsByDayId: {}, // dayId -> { status, finishedAt, solvedAt }
    resultsByGameKey: {}, // dayId:seed:variant -> { status, finishedAt, solvedAt, seed, variant }
  };
}

export function recordFinishedGame(stats, state) {
  const length = normalizeWordLength(state.wordLength || WordLengths.five);
  const mode = state.mode;
  const modeId = modeKey(mode, length);
  const modeStats = stats && stats[modeId];
  if (!modeStats) return stats;
  if (state.status !== "won" && state.status !== "lost") return stats;

  const variant = state.variant || "single";
  const dayKey = `${state.dayId}:${length}`;
  const gameKey = `${state.dayId}:${length}:${state.seed}:${variant}`;
  if (!modeStats.resultsByGameKey) modeStats.resultsByGameKey = {};
  if (!modeStats.resultsByDayId) modeStats.resultsByDayId = {};
  const already = modeStats.resultsByGameKey[gameKey];
  if (already) return stats;
  if (variant === "single" && modeStats.resultsByDayId[dayKey]) return stats;
  const hasDayResult =
    !!modeStats.resultsByDayId[dayKey] ||
    Object.keys(modeStats.resultsByGameKey).some((key) => String(key).startsWith(`${dayKey}:`));

  const cfg = modeConfig(mode, { wordLength: length });
  const finishedAt = state.status === "won" ? Math.max(...state.solvedAt.filter((v) => v != null)) : cfg.maxAttempts;

  const next = JSON.parse(JSON.stringify(stats));
  const ms = next[modeId];
  if (!ms.resultsByGameKey) ms.resultsByGameKey = {};
  if (!ms.resultsByDayId) ms.resultsByDayId = {};

  ms.played += 1;
  ms.lastPlayedDayId = state.dayId;
  ms.resultsByGameKey[gameKey] = {
    status: state.status,
    finishedAt,
    solvedAt: state.solvedAt.slice(),
    seed: state.seed,
    variant,
  };
  if (variant === "single") {
    ms.resultsByDayId[dayKey] = {
      status: state.status,
      finishedAt,
      solvedAt: state.solvedAt.slice(),
    };
  }

  if (state.status === "won") {
    ms.wins += 1;
    if (!hasDayResult) {
      ms.currentStreak = ms.lastWinDayId === state.dayId - 1 ? ms.currentStreak + 1 : 1;
      ms.bestStreak = Math.max(ms.bestStreak, ms.currentStreak);
      ms.lastWinDayId = state.dayId;
    }
    ms.distribution[String(finishedAt)] = (ms.distribution[String(finishedAt)] || 0) + 1;
  } else {
    ms.losses += 1;
    if (!hasDayResult) ms.currentStreak = 0;
  }

  // Cap history size (keep newest 400 days)
  const keys = Object.keys(ms.resultsByGameKey);
  if (keys.length > 400) {
    keys
      .map((key) => {
        const day = Number(String(key).split(":")[0]);
        return { key, day: Number.isFinite(day) ? day : null };
      })
      .filter((item) => item.day != null)
      .sort((a, b) => a.day - b.day)
      .slice(0, keys.length - 400)
      .forEach((item) => {
        delete ms.resultsByGameKey[item.key];
      });
  }

  const dayKeys = Object.keys(ms.resultsByDayId);
  if (dayKeys.length > 400) {
    dayKeys
      .map((k) => {
        const day = Number(String(k).split(":")[0]);
        return Number.isFinite(day) ? day : null;
      })
      .filter((n) => n != null)
      .sort((a, b) => a - b)
      .slice(0, dayKeys.length - 400)
      .forEach((day) => {
        Object.keys(ms.resultsByDayId).forEach((key) => {
          if (String(key).startsWith(`${day}:`)) delete ms.resultsByDayId[key];
        });
      });
  }

  return next;
}
