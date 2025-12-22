const EPOCH_LOCAL_MS = new Date(1970, 0, 1).getTime();
const DAY_MS = 24 * 60 * 60 * 1000;

export function dayIdFromLocalDate(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const localMidnight = new Date(y, m, d).getTime();
  return Math.floor((localMidnight - EPOCH_LOCAL_MS) / DAY_MS);
}

export function mod(n, m) {
  return ((n % m) + m) % m;
}

export function pickIndex({ dayId, seed = 0, length }) {
  if (!Number.isInteger(dayId)) throw new Error("dayId must be an integer");
  if (!Number.isInteger(seed)) throw new Error("seed must be an integer");
  if (!Number.isInteger(length) || length <= 0) throw new Error("length must be a positive integer");
  return mod(dayId + seed, length);
}

export function pickUniqueIndices({ count, dayId, seed = 0, length, stride = 137 }) {
  if (!Number.isInteger(count) || count <= 0) throw new Error("count must be a positive integer");
  const used = new Set();
  const indices = [];
  for (let i = 0; i < count; i += 1) {
    let idx = pickIndex({ dayId: dayId + i * stride, seed, length });
    while (used.has(idx)) idx = mod(idx + 1, length);
    used.add(idx);
    indices.push(idx);
  }
  return indices;
}

function toUint32(n) {
  return n >>> 0;
}

export function mixSeed(dayId, seed = 0) {
  let x = toUint32(dayId) ^ toUint32(Math.imul(seed, 0x9e3779b9));
  x = (x + 0x7f4a7c15) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

export function createXorshift32(seed) {
  let x = (seed >>> 0) || 0x1a2b3c4d;
  return function next() {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x >>>= 0;
    x ^= x << 5;
    x >>>= 0;
    return x >>> 0;
  };
}

export function pickRandomUniqueIndices({ count, dayId, seed = 0, length }) {
  if (!Number.isInteger(count) || count <= 0) throw new Error("count must be a positive integer");
  if (!Number.isInteger(length) || length <= 0) throw new Error("length must be a positive integer");
  if (count > length) throw new Error("count cannot be greater than length");

  const rng = createXorshift32(mixSeed(dayId, seed));
  const used = new Set();
  const indices = [];

  while (indices.length < count) {
    const idx = rng() % length;
    if (used.has(idx)) continue;
    used.add(idx);
    indices.push(idx);
  }
  return indices;
}

export function pickDailyModeIndices({ dayId, seed = 0, length }) {
  const total = 7; // 1 (Termo) + 2 (Dueto) + 4 (Quarteto)
  const idx = pickRandomUniqueIndices({ count: total, dayId, seed, length });
  return {
    termo: [idx[0]],
    dueto: [idx[1], idx[2]],
    quarteto: [idx[3], idx[4], idx[5], idx[6]],
  };
}
