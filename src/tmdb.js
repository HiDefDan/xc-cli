import axios from 'axios';
import { cached } from './cache.js';

const API = process.env.TMDB_API_BASE || 'https://api.themoviedb.org/3';
const API_KEY = process.env.TMDB_API_KEY;
const TTL = 7 * 24 * 60 * 60 * 1000; // episode/movie metadata rarely changes day to day

// v4 read-access tokens are JWTs (three dot-separated segments); v3 keys
// are short opaque strings — support whichever kind ended up in .env
// rather than forcing the user to know which kind they have.
function authOpts() {
  if (API_KEY && API_KEY.split('.').length === 3) {
    return { headers: { Authorization: `Bearer ${API_KEY}` }, params: {} };
  }
  return { headers: {}, params: { api_key: API_KEY } };
}

function get(path, params = {}) {
  const auth = authOpts();
  return axios.get(`${API}${path}`, { headers: auth.headers, params: { ...auth.params, ...params } });
}

/** Canonical episode/season counts for a show, or null if TMDB has no match. */
export async function lookupShow(title) {
  return cached(`tmdb:tv:${title.toLowerCase()}`, TTL, async () => {
    const search = await get('/search/tv', { query: title });
    const match = search.data.results?.[0];
    if (!match) return null;

    const details = await get(`/tv/${match.id}`).catch(() => null);
    return {
      id: match.id,
      name: match.name,
      status: details?.data?.status || null,
      totalEpisodes: details?.data?.number_of_episodes ?? null,
    };
  });
}

/** Compares a catalog entry's actual season/episode structure against TMDB's canonical count. */
export function completeness(episodesBySeason, tmdbData) {
  if (!tmdbData || !tmdbData.totalEpisodes) return null;
  let actual = 0;
  for (const episodes of Object.values(episodesBySeason || {})) actual += episodes.length;
  return { actual, expected: tmdbData.totalEpisodes, ratio: actual / tmdbData.totalEpisodes };
}

/** Canonical movie match, used to merge duplicate sources whose cleaned titles differ slightly across providers. */
export async function lookupMovie(title) {
  return cached(`tmdb:movie:${title.toLowerCase()}`, TTL, async () => {
    const search = await get('/search/movie', { query: title });
    const match = search.data.results?.[0];
    if (!match) return null;
    return { id: match.id, title: match.title };
  });
}
