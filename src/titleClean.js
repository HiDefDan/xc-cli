/** Strips catalog junk (language prefix, trailing year/country tags) down to a bare title for external lookups. */
export function cleanTitle(name) {
  let s = name.replace(/^[A-Za-z0-9+]{1,8}(?:-[A-Za-z0-9+]{1,8})?\s*[-+:]\s*/, '');
  let prev;
  do {
    prev = s;
    s = s.replace(/\s*\((?:\d{4}|[A-Za-z]{2,4})\)\s*$/, '');
  } while (s !== prev);
  return s.trim();
}

/**
 * Episode titles from get_series_info repeat the provider prefix AND the
 * show name AND the season/episode code ahead of the actual episode title
 * (e.g. "4K-A+ - Slow Horses - S01E01 - Failure's Contagious") — all of
 * which is already shown elsewhere in the episode list/season context, so
 * strip through the season/episode code to leave just the episode title.
 */
export function cleanEpisodeTitle(name) {
  const s = cleanTitle(name);
  return s.replace(/^.*?S\d{1,2}E\d{1,4}\s*[-:]\s*/i, '').trim();
}
