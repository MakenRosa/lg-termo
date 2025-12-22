import { modeConfig } from "./modes.js";

export function createEmptyStats() {
  return {
    version: 1,
    termo: emptyModeStats(),
    dueto: emptyModeStats(),
    quarteto: emptyModeStats(),
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
  };
}

export function recordFinishedGame(stats, state) {
  const mode = state.mode;
  const modeStats = stats && stats[mode];
  if (!modeStats) return stats;
  if (state.status !== "won" && state.status !== "lost") return stats;

  const already = modeStats.resultsByDayId && modeStats.resultsByDayId[String(state.dayId)];
  if (already) return stats;

  const cfg = modeConfig(mode);
  const finishedAt = state.status === "won" ? Math.max(...state.solvedAt.filter((v) => v != null)) : cfg.maxAttempts;

  const next = JSON.parse(JSON.stringify(stats));
  const ms = next[mode];

  ms.played += 1;
  ms.lastPlayedDayId = state.dayId;
  ms.resultsByDayId[String(state.dayId)] = {
    status: state.status,
    finishedAt,
    solvedAt: state.solvedAt.slice(),
  };

  if (state.status === "won") {
    ms.wins += 1;
    ms.currentStreak = ms.lastWinDayId === state.dayId - 1 ? ms.currentStreak + 1 : 1;
    ms.bestStreak = Math.max(ms.bestStreak, ms.currentStreak);
    ms.lastWinDayId = state.dayId;
    ms.distribution[String(finishedAt)] = (ms.distribution[String(finishedAt)] || 0) + 1;
  } else {
    ms.losses += 1;
    ms.currentStreak = 0;
  }

  // Cap history size (keep newest 400 days)
  const keys = Object.keys(ms.resultsByDayId);
  if (keys.length > 400) {
    keys
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)
      .slice(0, keys.length - 400)
      .forEach((day) => {
        delete ms.resultsByDayId[String(day)];
      });
  }

  return next;
}
