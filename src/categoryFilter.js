import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { isCategoryForeign } from './languageFilter.js';

const EXCLUDED_PATH = path.resolve('data/excluded-categories.json');

async function load() {
  try {
    return JSON.parse(await readFile(EXCLUDED_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function persist(list) {
  await mkdir(path.dirname(EXCLUDED_PATH), { recursive: true });
  const tmpPath = `${EXCLUDED_PATH}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await writeFile(tmpPath, JSON.stringify(list, null, 2));
  await rename(tmpPath, EXCLUDED_PATH);
}

function key(type, categoryId) {
  return `${type}:${categoryId}`;
}

/**
 * Category-level exclusion, separate from (and stronger than) the
 * title-level language filter: those results still show up under "show
 * more", these never do, and crawlFullCatalog skips fetching them at all.
 * Derived once from the same category-keyword/script classifier already
 * validated against the real catalog, then persisted so it's stable and
 * user-editable rather than silently recomputed differently each run.
 */
export async function getExcludedCategories(client) {
  let stored = await load();
  if (stored) return stored;

  const movieCats = await client.getVodCategories();
  const seriesCats = await client.getSeriesCategories();
  const excluded = [];
  for (const c of movieCats) {
    if (isCategoryForeign(c.category_name)) excluded.push({ type: 'movie', id: c.category_id, name: c.category_name });
  }
  for (const c of seriesCats) {
    if (isCategoryForeign(c.category_name)) excluded.push({ type: 'series', id: c.category_id, name: c.category_name });
  }
  await persist(excluded);
  return excluded;
}

export async function getExcludedCategorySet(client) {
  const excluded = await getExcludedCategories(client);
  return new Set(excluded.map((c) => key(c.type, c.id)));
}

export function isCategoryExcluded(set, type, categoryId) {
  return set.has(key(type, categoryId));
}
