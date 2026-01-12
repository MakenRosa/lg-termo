import { normalizeWord } from "./normalize.js";

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

function toWordPairs(list) {
  const seen = new Set();
  const pairs = [];
  if (!Array.isArray(list)) return pairs;
  for (const item of list) {
    const original = String(item);
    const normalized = normalizeWord(original);
    if (normalized.length !== 5) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    pairs.push({ original, normalized });
  }
  return pairs;
}

export async function loadWordLists({ dictionaryPath = "./data/dictionary.json" } = {}) {
  const dictionaryRaw = await fetchJSON(dictionaryPath);
  const dictionary = Array.isArray(dictionaryRaw) ? dictionaryRaw : dictionaryRaw && dictionaryRaw.words;
  const weightsMap = !Array.isArray(dictionaryRaw) && dictionaryRaw && dictionaryRaw.weights;

  const pool = toWordPairs(dictionary);
  if (pool.length === 0) throw new Error("dictionary list is empty or invalid");
  if (pool.length < 7) throw new Error("dictionary must contain at least 7 valid 5-letter words (Termo+Dueto+Quarteto)");

  const dictionarySet = new Set();
  for (const w of pool) dictionarySet.add(w.normalized);

  const weights = pool.map(({ original }) => {
    if (!weightsMap) return 1;
    const weight = Number(weightsMap[original]);
    return Number.isFinite(weight) && weight > 0 ? weight : 1;
  });

  return { pool, dictionarySet, weights };
}

export function isValidGuess(dictionarySet, guess) {
  if (!(dictionarySet instanceof Set)) return false;
  return dictionarySet.has(normalizeWord(guess));
}
