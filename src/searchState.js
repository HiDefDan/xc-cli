import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

const STATE_PATH = path.resolve('data/search-state.json');

async function load() {
  try {
    return JSON.parse(await readFile(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function persist(state) {
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  const tmpPath = `${STATE_PATH}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await writeFile(tmpPath, JSON.stringify(state, null, 2));
  await rename(tmpPath, STATE_PATH);
}

/** Remembers the last-typed search term per section ('movie'/'series'/'all') across quits/restarts. */
export async function getLastSearchTerm(section) {
  const state = await load();
  return state[section] || '';
}

export async function setLastSearchTerm(section, term) {
  const state = await load();
  state[section] = term;
  await persist(state);
}
