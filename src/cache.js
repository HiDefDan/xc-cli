import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

const CACHE_PATH = path.resolve('data/cache.json');

let store = null;
let loadPromise = null;
let writeChain = Promise.resolve();

// A single in-flight load promise, shared by every concurrent caller —
// two callers racing to read the file before either finishes would
// otherwise each build their own store object, and whichever finished
// loading second would silently overwrite the other's in-memory writes.
async function load() {
  if (store) return store;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        store = JSON.parse(await readFile(CACHE_PATH, 'utf8'));
      } catch {
        store = {};
      }
      return store;
    })();
  }
  return loadPromise;
}

// Writes are chained onto one promise so concurrent cache misses (e.g. a
// Promise.all of several cached() calls) can't collide on the same temp
// file or interleave their write-then-rename steps.
function persist() {
  writeChain = writeChain.then(async () => {
    await mkdir(path.dirname(CACHE_PATH), { recursive: true });
    const tmpPath = `${CACHE_PATH}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    await writeFile(tmpPath, JSON.stringify(store));
    await rename(tmpPath, CACHE_PATH);
  });
  return writeChain;
}

/** Cache-aside: serve a fresh-enough cached value, otherwise fetch, store, and return it. `force` skips the TTL check outright — for the handful of call sites (watchlist) where it's worth paying for a live call every time. */
export async function cached(key, ttlMs, fetchFn, { force = false } = {}) {
  const data = await load();
  const entry = data[key];
  if (!force && entry && Date.now() - entry.fetchedAt <= ttlMs) {
    return entry.value;
  }
  const fresh = await fetchFn();
  data[key] = { value: fresh, fetchedAt: Date.now() };
  await persist();
  return fresh;
}

/** All cached values whose key starts with `prefix` — used to build a search index from whatever's cached so far. */
export async function allCached(prefix) {
  const data = await load();
  return Object.entries(data)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, entry]) => ({ key, value: entry.value }));
}
