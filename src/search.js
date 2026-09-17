import { allCached } from './cache.js';
import { getExcludedCategorySet, isCategoryExcluded } from './categoryFilter.js';

/** Builds a title index from whatever category listings are already cached — no live calls beyond category names. Excluded categories never make it into the index at all, even if already cached. */
export async function buildIndexFromCache(client) {
  const username = client.username;
  const [vodEntries, seriesEntries, movieCats, seriesCats, excluded] = await Promise.all([
    allCached(`${username}:vod_streams:`),
    allCached(`${username}:series:`),
    client.getVodCategories(),
    client.getSeriesCategories(),
    getExcludedCategorySet(client),
  ]);

  const movieCatName = Object.fromEntries(movieCats.map((c) => [c.category_id, c.category_name]));
  const seriesCatName = Object.fromEntries(seriesCats.map((c) => [c.category_id, c.category_name]));

  const index = [];
  for (const { value: streams } of vodEntries) {
    for (const s of streams) {
      if (isCategoryExcluded(excluded, 'movie', s.category_id)) continue;
      index.push({
        type: 'movie',
        id: s.stream_id,
        name: s.name,
        categoryId: s.category_id,
        categoryName: movieCatName[s.category_id] || '',
      });
    }
  }
  for (const { value: seriesList } of seriesEntries) {
    for (const s of seriesList) {
      if (isCategoryExcluded(excluded, 'series', s.category_id)) continue;
      index.push({
        type: 'series',
        id: s.series_id,
        name: s.name,
        categoryId: s.category_id,
        categoryName: seriesCatName[s.category_id] || '',
      });
    }
  }
  return index;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word match so "reacher" finds "Reacher" but not "Preacher". */
export function searchIndex(index, term) {
  const pattern = new RegExp(`\\b${escapeRegex(term.trim())}\\b`, 'i');
  return index.filter((item) => pattern.test(item.name));
}

/**
 * Crawls every non-excluded movie/series category live to populate the
 * cache — still sizable, but skipping excluded categories cuts both the
 * request count and the wait.
 */
export async function crawlFullCatalog(client, onProgress) {
  const movieCats = await client.getVodCategories();
  const seriesCats = await client.getSeriesCategories();
  const excluded = await getExcludedCategorySet(client);

  const movieTargets = movieCats.filter((c) => !isCategoryExcluded(excluded, 'movie', c.category_id));
  const seriesTargets = seriesCats.filter((c) => !isCategoryExcluded(excluded, 'series', c.category_id));
  const total = movieTargets.length + seriesTargets.length;
  let done = 0;

  for (const c of movieTargets) {
    await client.getVodStreams(c.category_id);
    done++;
    onProgress?.(done, total);
  }
  for (const c of seriesTargets) {
    await client.getSeries(c.category_id);
    done++;
    onProgress?.(done, total);
  }
  return total;
}
