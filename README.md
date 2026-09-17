# xc-cli

A lightweight CLI-based IPTV VOD player for Xtream Codes, built with Node.js.
No OS-specific code — needs Node and mpv installed, nothing more.

## Features

- **Live search** — debounced, autocomplete-as-you-type across the whole
  catalog, or scoped to just Movies or Series
- **Deduplicated results** — the same title from multiple provider sources
  is collapsed into one entry, ranked by real signals: TMDB
  episode-completeness for series, bitrate for movies
- **TMDB metadata** — the only third-party metadata source. Used for series
  episode-completeness ranking and for merging duplicate sources (movies
  and series) whose catalog titles differ slightly across providers
- **Clean titles** — provider junk (language/quality prefixes, repeated
  show name + season/episode code in episode titles) stripped for display
- **Language filtering** — non-English content is deprioritized, not
  hidden, both by title prefix and by category name
- **Local watchlist** — add/remove movies and series, browsable separately
- **Download or play** — stream straight to mpv, or save to disk
  (`DOWNLOAD_DIR`) with progress and cleanup on failure
- **Keyboard navigation** — Escape or Left = Back, Right = Select, in
  addition to Enter, throughout every menu
- **VPN recommended, not enforced** — Xtream credentials are usually tied
  to one IP; running behind a VPN is entirely up to you, this app doesn't
  manage or verify one

## Quick Start

```bash
# Setup
npm install

# Create .env with credentials
cp .env.example .env
# Edit: XTREAM_SERVER, XTREAM_USER, XTREAM_PASS, TMDB_API_KEY

# Run
npm start
```

`.env` is gitignored — never commit it.

## Configuration

All via `.env` (see `.env.example`):

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `XTREAM_SERVER`, `XTREAM_USER`, `XTREAM_PASS` | yes | — | Xtream Codes account |
| `TMDB_API_KEY` | yes, for ranking/dedup | — | v3 API key or v4 read-access token |
| `MPV_PATH` | no | `mpv` | mpv binary to spawn |
| `MPV_WINDOW_MODE` | no | `fit` | `fit` / `fullscreen` / `native` |
| `DOWNLOAD_DIR` | no | `~/Downloads/xc-cli` | Where "Download" saves files |
| `TMDB_API_BASE` | no | `https://api.themoviedb.org/3` | Override for testing |
| `XTREAM_MIN_REQUEST_INTERVAL_MS` | no | `750` | Self-imposed throttle between Xtream API calls |

## Architecture

Plain Node.js modules under `src/`, no framework:

- `xtream.js` — Xtream Codes API client, self-throttled
- `cache.js` — cache-aside JSON file store (`data/cache.json`), not a
  database — SQLite was tried and dropped after repeated native-binding
  crashes
- `search.js`, `titleClean.js`, `languageFilter.js`, `categoryFilter.js` —
  catalog indexing, title cleanup, and language/category filtering
- `tmdb.js` — the only metadata provider
- `watchlist.js`, `searchState.js` — local JSON-backed persistence
- `player.js`, `downloader.js` — spawn mpv, or stream a file to disk
- `cli.js` — all menu/navigation logic (inquirer + a custom
  `inquirer-autocomplete-prompt` for live search)

## Explicitly not supported

- **Trakt / TVTime** — TVTime is dead and Trakt requires a paid plan for
  API access this app would need; not something this project depends on
- **EAC3 / audio codec filtering** — floated early on as a possible issue
  on Fire TV-class hardware, never confirmed either way, and not
  implemented. Not a real feature or a concrete plan.
- **SQLite** — abandoned as a technical approach; see `cache.js` above

## Author

Dan Hall
