import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

const WATCHLIST_PATH = path.resolve('data/watchlist.json');

async function load() {
  try {
    return JSON.parse(await readFile(WATCHLIST_PATH, 'utf8'));
  } catch {
    return [];
  }
}

async function persist(list) {
  await mkdir(path.dirname(WATCHLIST_PATH), { recursive: true });
  const tmpPath = `${WATCHLIST_PATH}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await writeFile(tmpPath, JSON.stringify(list, null, 2));
  await rename(tmpPath, WATCHLIST_PATH);
}

export async function getWatchlist() {
  return load();
}

export async function addToWatchlist(item) {
  const list = await load();
  const exists = list.some((i) => i.type === item.type && i.id === item.id);
  if (!exists) {
    list.push({ ...item, addedAt: Date.now() });
    await persist(list);
  }
  return list;
}

export async function removeFromWatchlist(type, id) {
  const list = await load();
  const filtered = list.filter((i) => !(i.type === type && i.id === id));
  await persist(filtered);
  return filtered;
}
