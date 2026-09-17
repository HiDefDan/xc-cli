import axios from 'axios';
import { cached } from './cache.js';

const API = process.env.TVMAZE_API_BASE || 'https://api.tvmaze.com';
const TTL = 7 * 24 * 60 * 60 * 1000; // episode counts for an existing show rarely change day to day

/** Canonical episode/season counts for a show, or null if TVmaze has no match. */
export async function lookupShow(title) {
  return cached(`tvmaze:${title.toLowerCase()}`, TTL, async () => {
    let res;
    try {
      res = await axios.get(`${API}/singlesearch/shows`, { params: { q: title, embed: 'episodes' } });
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
    const episodes = res.data._embedded?.episodes || [];
    const episodesBySeason = {};
    for (const e of episodes) {
      if (e.season == null) continue;
      episodesBySeason[e.season] = (episodesBySeason[e.season] || 0) + 1;
    }
    return {
      id: res.data.id,
      name: res.data.name,
      status: res.data.status,
      totalEpisodes: episodes.length,
      episodesBySeason,
    };
  });
}

/** Compares a catalog entry's actual season/episode structure against TVmaze's canonical count. */
export function completeness(episodesByseason, tvmazeData) {
  if (!tvmazeData || !tvmazeData.totalEpisodes) return null;
  let actual = 0;
  for (const episodes of Object.values(episodesByseason || {})) actual += episodes.length;
  return { actual, expected: tvmazeData.totalEpisodes, ratio: actual / tvmazeData.totalEpisodes };
}
