import inquirer from 'inquirer';
import { play, MPV_FETCH_FAILED } from './player.js';
import { downloadStream } from './downloader.js';
import { buildIndexFromCache, searchIndex, crawlFullCatalog } from './search.js';
import { partitionByLanguage } from './languageFilter.js';
import { getWatchlist, addToWatchlist, removeFromWatchlist } from './watchlist.js';
import { getLastSearchTerm, setLastSearchTerm } from './searchState.js';
import { cleanTitle, cleanEpisodeTitle } from './titleClean.js';
import { lookupShow, completeness, lookupMovie } from './tmdb.js';
import BackableListPrompt from './backableListPrompt.js';
import BackableAutocompletePrompt from './backableAutocompletePrompt.js';

// Replaces the built-in "list" prompt everywhere in the app: Escape now
// submits null, same as picking "← Back", instead of doing nothing.
inquirer.registerPrompt('list', BackableListPrompt);
inquirer.registerPrompt('autocomplete', BackableAutocompletePrompt);

function extFromInfo(info, fallback = 'mp4') {
  return info?.movie_data?.container_extension || info?.info?.container_extension || fallback;
}

/** Returns mpv's exit code, so callers can tell a fetch failure apart from a normal quit. */
async function playMovie(client, streamId, title) {
  const info = await client.getVodInfo(streamId);
  const ext = extFromInfo(info);
  const url = client.buildVodStreamUrl(streamId, ext);

  console.log(`Playing: ${title}`);
  return play(url, { mpvPath: process.env.MPV_PATH, title });
}

async function downloadMovie(client, streamId, title) {
  const info = await client.getVodInfo(streamId);
  const ext = extFromInfo(info);
  const url = client.buildVodStreamUrl(streamId, ext);

  console.log(`Downloading: ${title}`);
  try {
    await downloadStream(url, `${title}.${ext}`);
  } catch (err) {
    console.error(`Download failed: ${err.message}`);
  }
}

async function downloadEpisode(client, showTitle, season, episode) {
  const ext = episode.container_extension || 'mp4';
  const url = client.buildSeriesStreamUrl(episode.id, ext);
  const episodeTitle = cleanEpisodeTitle(episode.title);
  const seasonNum = String(season).padStart(2, '0');
  const episodeNum = String(episode.episode_num).padStart(2, '0');
  const filename = `${showTitle} - S${seasonNum}E${episodeNum} - ${episodeTitle}.${ext}`;

  console.log(`Downloading: ${showTitle} S${season}E${episode.episode_num} — ${episodeTitle}`);
  try {
    await downloadStream(url, filename);
  } catch (err) {
    console.error(`Download failed: ${err.message}`);
  }
}

/** Lets the user pick a season, then an episode, to download — separate from the play loop above so "Play now" stays a single, fast keystroke. */
async function downloadEpisodeFlow(client, info, showTitle, seasons) {
  const { season } = await inquirer.prompt([
    {
      type: 'list',
      name: 'season',
      message: `${showTitle} — download from which season?`,
      choices: [
        ...seasons.map((s) => ({ name: `Season ${s}`, value: s })),
        new inquirer.Separator(),
        { name: '← Back', value: null },
      ],
    },
  ]);
  if (!season) return;

  const episodes = info.episodes[season];
  for (;;) {
    const { episode } = await inquirer.prompt([
      {
        type: 'list',
        name: 'episode',
        message: `Download — Season ${season}`,
        pageSize: 20,
        choices: [
          ...episodes.map((e) => ({ name: `E${e.episode_num} — ${cleanEpisodeTitle(e.title)}`, value: e })),
          new inquirer.Separator(),
          { name: '← Back', value: null },
        ],
      },
    ]);
    if (!episode) return;
    await downloadEpisode(client, showTitle, season, episode);
    // loop back so grabbing several episodes from the same season is quick
  }
}

/**
 * Tries sources in ranked order, only advancing to the next one when mpv
 * itself reports it couldn't fetch/open the stream — a normal quit (or any
 * other mpv exit) is left alone rather than treated as a reason to retry.
 */
async function playMovieWithFallback(client, sources, startIndex = 0) {
  for (let i = startIndex; i < sources.length; i++) {
    const source = sources[i];
    const code = await playMovie(client, source.id, source.name);
    if (code !== MPV_FETCH_FAILED) return;
    const next = sources[i + 1];
    if (next) console.log(`"${source.name}" failed to fetch — trying next source (${next.name})...`);
  }
  console.log('All available sources failed to fetch.');
}

/**
 * Season → episode navigation. "Back" at episode level returns to season
 * list, not out of the show entirely.
 *
 * getExtraChoices/onExtra let a caller fold extra actions (e.g. watchlist
 * toggle) into the season prompt itself, re-evaluated each loop pass so a
 * label like "Add"/"Remove" stays in sync after it fires. Values are
 * prefixed "__extra:" so they can't collide with a season key.
 *
 * forceRefresh bypasses the 24h series_info cache — used for watchlist
 * entries, where the catalog is small enough that a live check on every
 * open is cheap, and staying current matters (newly-added episodes).
 */
async function playSeriesEpisode(client, seriesId, { getExtraChoices, onExtra, forceRefresh = false } = {}) {
  if (forceRefresh) console.log('Checking for new episodes...');
  const info = await client.getSeriesInfo(seriesId, { force: forceRefresh });
  const showTitle = cleanTitle(info.info.name);
  const seasons = Object.keys(info.episodes || {});
  if (!seasons.length) {
    console.log('No seasons found for this show.');
    return;
  }

  for (;;) {
    const extra = getExtraChoices ? getExtraChoices() : [];
    const { season } = await inquirer.prompt([
      {
        type: 'list',
        name: 'season',
        message: `${showTitle} — Season`,
        choices: [
          ...seasons.map((s) => ({ name: `Season ${s}`, value: s })),
          new inquirer.Separator(),
          { name: '⬇ Download an episode...', value: '__extra:download-episode' },
          ...extra,
          new inquirer.Separator(),
          { name: '← Back', value: null },
        ],
      },
    ]);
    if (!season) return;
    if (season === '__extra:download-episode') {
      await downloadEpisodeFlow(client, info, showTitle, seasons);
      continue;
    }
    if (season.startsWith('__extra:')) {
      await onExtra(season);
      continue; // re-render the season prompt so a toggled label is reflected
    }

    const episodes = info.episodes[season];
    for (;;) {
      const { episode } = await inquirer.prompt([
        {
          type: 'list',
          name: 'episode',
          message: 'Episode',
          pageSize: 20,
          choices: [
            ...episodes.map((e) => ({ name: `E${e.episode_num} — ${cleanEpisodeTitle(e.title)}`, value: e })),
            new inquirer.Separator(),
            { name: '← Back', value: null },
          ],
        },
      ]);
      if (!episode) break; // back to season list

      const ext = episode.container_extension || 'mp4';
      const url = client.buildSeriesStreamUrl(episode.id, ext);
      const episodeTitle = cleanEpisodeTitle(episode.title);

      console.log(`Playing: ${showTitle} S${season}E${episode.episode_num} — ${episodeTitle}`);
      await play(url, { mpvPath: process.env.MPV_PATH, title: `${showTitle} S${season}E${episode.episode_num} — ${episodeTitle}` });
      // loop back to the same season's episode list so the next episode is one step away
    }
  }
}


/** Presents one search/watchlist match: play it, or manage its watchlist membership. */
async function handleMatch(client, item, { inWatchlist }) {
  const title = cleanTitle(item.name);

  if (item.type === 'series') {
    // Browsing is the only real action for a series here — a one-item
    // "Browse seasons/episodes" menu just adds a step. Go straight to
    // season selection and fold watchlist toggling into that prompt.
    let watchlisted = inWatchlist;
    await playSeriesEpisode(client, item.id, {
      forceRefresh: true,
      getExtraChoices: () => [
        watchlisted
          ? { name: 'Remove from watchlist', value: '__extra:remove' }
          : { name: 'Add to watchlist', value: '__extra:add' },
      ],
      onExtra: async (value) => {
        if (value === '__extra:add') {
          await addToWatchlist(item);
          watchlisted = true;
          console.log(`Added "${title}" to your watchlist.`);
        } else {
          await removeFromWatchlist(item.type, item.id);
          watchlisted = false;
          console.log(`Removed "${title}" from your watchlist.`);
        }
      },
    });
    return;
  }

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: title,
      choices: [
        { name: 'Play now', value: 'play' },
        { name: 'Download', value: 'download' },
        inWatchlist ? { name: 'Remove from watchlist', value: 'remove' } : { name: 'Add to watchlist', value: 'add' },
        new inquirer.Separator(),
        { name: '← Back', value: null },
      ],
    },
  ]);

  if (action === 'play') {
    await playMovie(client, item.id, title);
  } else if (action === 'download') {
    await downloadMovie(client, item.id, title);
  } else if (action === 'add') {
    await addToWatchlist(item);
    console.log(`Added "${title}" to your watchlist.`);
  } else if (action === 'remove') {
    await removeFromWatchlist(item.type, item.id);
    console.log(`Removed "${title}" from your watchlist.`);
  }
}

/**
 * Pass 1 of grouping: buckets raw catalog items by cleaned title alone —
 * free, local, no network. Deliberately takes the full, uncapped match
 * list (not a pre-truncated subset) so a real duplicate source is never
 * invisible to grouping just because of its position in an unsorted
 * catalog match list; only catches sources whose title string is
 * identical after cleaning — near-miss spelling/punctuation variants are
 * enrichAndMergeGroups's job below.
 */
function groupByCleanedTitle(items) {
  const byKey = new Map();
  for (const item of items) {
    const title = cleanTitle(item.name);
    const key = `${item.type}:${title}`;
    if (!byKey.has(key)) byKey.set(key, { type: item.type, title, sources: [] });
    byKey.get(key).sources.push(item);
  }
  return [...byKey.values()];
}

// Once Pass 1 runs over an uncapped match list, a single group's sources
// can grow past what's reasonable to rank in one search (a heavily
// duplicated title could fold in dozens) — this only bites on that
// title's first search, since getSeriesInfo/getVodInfo cache for 24h,
// but still worth a clean bound. Ranked sources sort first (existing
// comparators already sort null-scored entries last); the rest stay
// fully visible/selectable via "Choose a different source", just unranked.
const SOURCE_RANK_CAP = 10;

/**
 * Pass 2: ranks each (already Pass-1-grouped, already capped) group's
 * sources so the default pick isn't just an arbitrary catalog row —
 *  - series: actual-vs-canonical episode count from TMDB (one lookup
 *    per group, not per source)
 *  - movies: bitrate from get_vod_info — resolution/codec aren't
 *    reliably exposed, but bitrate is, and for same-runtime duplicates
 *    (confirmed via duration) it's a real, comparable quality signal
 *    (seen 2180–5296 kbps across duplicates of an identical-length file)
 *
 * — then merges any groups whose TMDB lookup resolved to the same
 * movie/show id — TMDB's search often resolves near-miss
 * spelling/punctuation variants across providers to one canonical title,
 * catching duplicates Pass 1's exact-string match misses.
 */
async function enrichAndMergeGroups(client, groups) {
  for (const group of groups) {
    if (group.type === 'series') {
      const tmdbData = await lookupShow(group.title).catch(() => null);
      group.metaId = tmdbData?.id ?? null;
      for (const source of group.sources.slice(0, SOURCE_RANK_CAP)) {
        if (!tmdbData) {
          source.completeness = null;
          continue;
        }
        const info = await client.getSeriesInfo(source.id).catch(() => null);
        source.completeness = info ? completeness(info.episodes, tmdbData) : null;
      }
    } else {
      const tmdbData = await lookupMovie(group.title).catch(() => null);
      group.metaId = tmdbData?.id ?? null;
    }
  }

  const merged = [];
  const byMetaId = new Map();
  for (const group of groups) {
    if (group.metaId) {
      const mapKey = `${group.type}:${group.metaId}`;
      const existing = byMetaId.get(mapKey);
      if (existing) {
        existing.sources.push(...group.sources);
        continue; // folded into an earlier group with the same TMDB id
      }
      byMetaId.set(mapKey, group);
    }
    merged.push(group);
  }

  // Bitrate ranking runs after merging so it sees each movie's final,
  // fully-combined source list rather than skipping a would-be-merged
  // group because it looked single-source before consolidation.
  for (const group of merged) {
    if (group.type === 'series') {
      group.sources.sort((a, b) => (b.completeness?.ratio ?? -1) - (a.completeness?.ratio ?? -1));
    } else {
      if (group.sources.length > 1) {
        for (const source of group.sources.slice(0, SOURCE_RANK_CAP)) {
          const info = await client.getVodInfo(source.id).catch(() => null);
          source.bitrate = info?.info?.bitrate || null;
        }
      }
      group.sources.sort((a, b) => (b.bitrate ?? -1) - (a.bitrate ?? -1));
    }
  }
  return merged;
}

function formatGroupLabel(g) {
  const kind = g.type === 'movie' ? 'Movie' : 'Show';
  let suffix = '';
  if (g.type === 'series' && g.sources[0].completeness) {
    const { actual, expected, ratio } = g.sources[0].completeness;
    suffix = ` (${actual}/${expected} eps${ratio >= 1 ? '' : ' ⚠'})`;
  } else if (g.type === 'movie' && g.sources[0].bitrate) {
    suffix = ` (${g.sources[0].bitrate} kbps)`;
  }
  return `[${kind}] ${g.title}${suffix}`;
}

/** Presents one grouped result: play/browse the best (or a chosen) source, or manage its watchlist membership. */
async function handleGroup(client, group) {
  for (;;) {
    const best = group.sources[0];
    const watchlist = await getWatchlist();
    const inWatchlist = watchlist.some((i) => i.type === group.type && i.id === best.id);

    const choices = [
      group.type === 'movie'
        ? { name: 'Play now', value: 'play' }
        : { name: 'Browse seasons/episodes', value: 'play' },
    ];
    if (group.type === 'movie') {
      choices.push({ name: 'Download', value: 'download' });
    }
    choices.push(inWatchlist ? { name: 'Remove from watchlist', value: 'remove' } : { name: 'Add to watchlist', value: 'add' });
    choices.push(new inquirer.Separator());
    choices.push({ name: '← Back', value: null });

    const { action } = await inquirer.prompt([{ type: 'list', name: 'action', message: group.title, choices }]);

    if (action === 'play') {
      if (group.type === 'movie') await playMovieWithFallback(client, group.sources);
      else await playSeriesEpisode(client, best.id);
    } else if (action === 'download') {
      await downloadMovie(client, best.id, group.title);
    } else if (action === 'add') {
      await addToWatchlist(best);
      console.log(`Added "${group.title}" to your watchlist.`);
    } else if (action === 'remove') {
      await removeFromWatchlist(group.type, best.id);
      console.log(`Removed "${group.title}" from your watchlist.`);
    } else {
      return;
    }
    // loop back to this group's action menu
  }
}

/**
 * Search is now also how Movies/Series "browsing" works — a flat catalog
 * has ~30k movies / ~8.7k shows even after category exclusion, too many
 * for a scrollable list with no filtering. typeFilter narrows to just
 * movies or just series when entered from those menu items; null (from
 * the generic Search entry) searches both.
 */
const SEARCH_DEBOUNCE_MS = 350;
// Caps distinct titles (post Pass-1 string-bucketing), not raw catalog
// rows — bucketing itself is free/local and always runs over every
// match, so a real duplicate source is never dropped just because of its
// position in an unsorted match list. This only bounds how many DISTINCT
// titles get the expensive TMDB/Xtream enrichment treatment.
const SEARCH_ENRICH_CAP = 25;

/**
 * Live, debounced search: results update as you type once you pause for
 * SEARCH_DEBOUNCE_MS, instead of requiring Enter first. The debounce is
 * load-bearing, not just a UX nicety — enrichment makes real TMDB and
 * Xtream calls (get_series_info/get_vod_info), and firing that on every
 * keystroke of a fast typist would hammer both far harder than a single
 * settled search does.
 */
async function searchTitles(client, typeFilter = null) {
  let index = await buildIndexFromCache(client);
  if (typeFilter) index = index.filter((item) => item.type === typeFilter);

  const label = typeFilter === 'movie' ? 'movies' : typeFilter === 'series' ? 'shows' : 'cached titles';
  const sectionKey = typeFilter || 'all';
  let generation = 0;
  // Carried across loop iterations (and persisted to disk on the way out)
  // so backing out of a picked result — or quitting and relaunching later
  // — reopens search already populated instead of forcing the same query
  // to be retyped from scratch.
  let lastTerm = await getLastSearchTerm(sectionKey);

  for (;;) {
    const { pick } = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'pick',
        message: `Search ${label}`,
        pageSize: 15,
        emptyText: 'No matches',
        default: lastTerm || undefined,
        source: async (answersSoFar, input) => {
          // The library calls source(undefined) once on open, before any
          // keypress — fall back to the remembered term so that initial
          // call re-searches instead of coming back empty.
          const term = (input === undefined ? lastTerm : input).trim();
          lastTerm = term;
          const myGen = ++generation;
          if (!term) return [];

          // Skip the debounce on that synthetic reopen call — there's no
          // typing pause to wait out, so waiting just delays results.
          await new Promise((resolve) => setTimeout(resolve, input === undefined ? 0 : SEARCH_DEBOUNCE_MS));
          if (myGen !== generation) return []; // superseded by further typing — a later call will settle and win

          const matches = searchIndex(index, term);
          if (!matches.length) return [];

          const { primary, rest } = partitionByLanguage(matches);
          const shown = primary.length ? primary : rest;

          // Pass 1: free, local, over every match — no cap, so a real
          // duplicate source is never dropped for raw-ranking reasons,
          // only ever folded into its group.
          const allGroups = groupByCleanedTitle(shown);
          const capped = allGroups.slice(0, SEARCH_ENRICH_CAP);

          // A later keystroke may have superseded this call during Pass 1
          // — bail before spending TMDB/Xtream calls on results about to
          // be discarded.
          if (myGen !== generation) return [];

          const groups = await enrichAndMergeGroups(client, capped);
          const choices = groups.map((g) => ({ name: formatGroupLabel(g), value: g }));
          if (allGroups.length > capped.length) {
            const hidden = allGroups.length - capped.length;
            choices.push({
              name: `(${hidden} more distinct title${hidden === 1 ? '' : 's'} — keep typing to narrow down)`,
              value: null,
              disabled: true,
            });
          }
          return choices;
        },
      },
    ]);

    if (!pick) {
      await setLastSearchTerm(sectionKey, lastTerm);
      return;
    }
    await handleGroup(client, pick);
    // loop back to a fresh search prompt
  }
}

async function showWatchlistSection(client, type) {
  for (;;) {
    const list = (await getWatchlist()).filter((i) => i.type === type); // re-read each pass so a removal is reflected immediately
    if (!list.length) return; // everything here got removed — back out to the Movies/Series chooser

    const sortedList = [...list].sort((a, b) => cleanTitle(a.name).localeCompare(cleanTitle(b.name)));
    const { pick } = await inquirer.prompt([
      {
        type: 'list',
        name: 'pick',
        message: `Watchlist — ${type === 'movie' ? 'Movies' : 'Series'} (${list.length})`,
        pageSize: 20,
        choices: [
          ...sortedList.map((i) => ({ name: cleanTitle(i.name), value: i })),
          new inquirer.Separator(),
          { name: '← Back', value: null },
        ],
      },
    ]);
    if (!pick) return;

    await handleMatch(client, pick, { inWatchlist: true });
    // loop back to this section's list
  }
}

/** Bare Movies/Series chooser in front of the same searchTitles() calls the old top-level Movies/Series items used directly. */
async function showBrowse(client) {
  for (;;) {
    const { section } = await inquirer.prompt([
      {
        type: 'list',
        name: 'section',
        message: 'Browse',
        choices: [
          { name: 'Movies', value: 'movie' },
          { name: 'Series', value: 'series' },
          new inquirer.Separator(),
          { name: '← Back', value: null },
        ],
      },
    ]);
    if (!section) return;

    await searchTitles(client, section);
    // loop back to the Movies/Series chooser
  }
}

async function showLocalWatchlist(client) {
  for (;;) {
    const list = await getWatchlist();
    if (!list.length) {
      console.log('Your local watchlist is empty — add titles from Search.');
      return;
    }

    const movieCount = list.filter((i) => i.type === 'movie').length;
    const seriesCount = list.filter((i) => i.type === 'series').length;

    const { section } = await inquirer.prompt([
      {
        type: 'list',
        name: 'section',
        message: `Watchlist (${list.length})`,
        choices: [
          { name: `Movies (${movieCount})`, value: 'movie', disabled: movieCount === 0 ? 'empty' : false },
          { name: `Series (${seriesCount})`, value: 'series', disabled: seriesCount === 0 ? 'empty' : false },
          new inquirer.Separator(),
          { name: '← Back', value: null },
        ],
      },
    ]);
    if (!section) return;

    await showWatchlistSection(client, section);
    // loop back to the Movies/Series chooser
  }
}

async function runFullCrawl(client, { confirmMessage }) {
  const { confirmed } = await inquirer.prompt([
    { type: 'confirm', name: 'confirmed', default: false, message: confirmMessage },
  ]);
  if (!confirmed) return false;

  const total = await crawlFullCatalog(client, (done, total) => {
    if (done % 20 === 0 || done === total) console.log(`  ${done}/${total} categories indexed...`);
  });
  console.log(`Done — indexed ${total} categories.`);
  return true;
}

async function buildFullSearchIndex(client) {
  await runFullCrawl(client, {
    confirmMessage:
      'This fetches every movie/series category live (~800 categories, several minutes even with throttling). Continue?',
  });
}

/** Single-action for now — a home for maintenance/admin actions as they show up, rather than cluttering the top-level menu. */
async function showSettings(client) {
  for (;;) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Settings',
        choices: [
          { name: '(Re)build full search index — update catalog (slow)', value: 'index' },
          new inquirer.Separator(),
          { name: '← Back', value: null },
        ],
      },
    ]);
    if (!action) return;

    await buildFullSearchIndex(client);
    // loop back to Settings
  }
}

export async function runMenu(client) {
  let exit = false;
  // Top level has no "← Back" to go to, so Escape/Left submits null here —
  // easy to trigger by accident while used to it meaning "back" one level
  // down. Require it twice in a row (with nothing else pressed between)
  // before actually quitting.
  let armedToQuit = false;
  while (!exit) {
    const { section } = await inquirer.prompt([
      {
        type: 'list',
        name: 'section',
        message: 'Xtream VOD Player',
        choices: [
          { name: 'Watchlist', value: 'watchlist' },
          { name: 'Search', value: 'search' },
          { name: 'Browse', value: 'browse' },
          { name: 'Settings', value: 'settings' },
        ],
      },
    ]);

    if (section === null) {
      if (armedToQuit) exit = true;
      else {
        armedToQuit = true;
        console.log('Press ← (or Esc) again to quit.');
      }
      continue;
    }
    armedToQuit = false;

    try {
      if (section === 'watchlist') await showLocalWatchlist(client);
      else if (section === 'search') await searchTitles(client);
      else if (section === 'browse') await showBrowse(client);
      else if (section === 'settings') await showSettings(client);
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
  }
}
