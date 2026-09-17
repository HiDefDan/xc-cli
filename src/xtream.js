import axios from 'axios';
import { cached } from './cache.js';

const MIN_REQUEST_INTERVAL_MS = Number(process.env.XTREAM_MIN_REQUEST_INTERVAL_MS || 750);

// Conservative, self-imposed — the provider doesn't document an actual
// rate limit, and hitting the live API too fast/from too many places is
// almost certainly what got the account temporarily blocked. These are
// defensive guesses, not confirmed limits.
const TTL = {
  CATEGORIES: 24 * 60 * 60 * 1000,
  LIST: 12 * 60 * 60 * 1000,
  INFO: 24 * 60 * 60 * 1000,
};

export class XtreamClient {
  #lastRequestAt = 0;

  constructor({ server, username, password }) {
    this.server = server.replace(/\/+$/, '');
    this.username = username;
    this.password = password;
    this.http = axios.create({ baseURL: this.server, timeout: 15000 });
  }

  async #throttle() {
    const wait = MIN_REQUEST_INTERVAL_MS - (Date.now() - this.#lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.#lastRequestAt = Date.now();
  }

  async #request(params) {
    await this.#throttle();
    const res = await this.http.get('/player_api.php', {
      params: { username: this.username, password: this.password, ...params },
    });
    return res.data;
  }

  #api(action, params = {}) {
    return this.#request({ action, ...params });
  }

  #cacheKey(...parts) {
    return [this.username, ...parts].join(':');
  }

  async authenticate() {
    const data = await this.#request({});
    const info = data?.user_info;
    if (!info || info.auth !== 1) {
      throw new Error(`Xtream authentication failed: ${info?.message || 'invalid credentials'}`);
    }
    return data;
  }

  getVodCategories() {
    return cached(this.#cacheKey('vod_categories'), TTL.CATEGORIES, () => this.#api('get_vod_categories'));
  }

  getVodStreams(categoryId) {
    return cached(this.#cacheKey('vod_streams', categoryId), TTL.LIST, () =>
      this.#api('get_vod_streams', { category_id: categoryId })
    );
  }

  getVodInfo(vodId) {
    return cached(this.#cacheKey('vod_info', vodId), TTL.INFO, () => this.#api('get_vod_info', { vod_id: vodId }));
  }

  getSeriesCategories() {
    return cached(this.#cacheKey('series_categories'), TTL.CATEGORIES, () => this.#api('get_series_categories'));
  }

  getSeries(categoryId) {
    return cached(this.#cacheKey('series', categoryId), TTL.LIST, () =>
      this.#api('get_series', { category_id: categoryId })
    );
  }

  getSeriesInfo(seriesId, { force = false } = {}) {
    return cached(
      this.#cacheKey('series_info', seriesId),
      TTL.INFO,
      () => this.#api('get_series_info', { series_id: seriesId }),
      { force }
    );
  }

  buildVodStreamUrl(streamId, extension = 'mp4') {
    return `${this.server}/movie/${this.username}/${this.password}/${streamId}.${extension}`;
  }

  buildSeriesStreamUrl(episodeId, extension = 'mp4') {
    return `${this.server}/series/${this.username}/${this.password}/${episodeId}.${extension}`;
  }
}
