# xc-cli

A lightweight CLI-based IPTV VOD player built with Node.js. No OS-specific
code — needs Node and mpv installed, nothing more.

## Vision

Build a smart Xtream Codes VOD client that:

1. **Filters content by preference** — Cross-references your Trakt/TVTime watch lists against available Xtream VOD groups (avoid browsing 8000+ titles)
2. **Cleans up messy titles** — Parse out junk (4K, AMAZON, 2024, pipes) to get clean hierarchy: Title → Season → Episode
3. **Smart audio selection** — Detect original language from title country code, auto-select compatible audio tracks, filter out problematic EAC3 codec
4. **VPN recommended, not enforced** — Xtream credentials are usually tied to one IP; running behind a VPN is on you, this app doesn't manage or verify one
5. **Native playback** — Stream to mpv with proper audio track selection
6. **Local caching** — SQLite cache of VOD hierarchy, Trakt mappings, playback state

## Architecture

**Core Logic (Node.js, reusable):**
- Xtream API client
- Title parser (extract season/episode/language from messy names)
- Audio codec detection (filter incompatible tracks)
- Trakt/TVTime fetcher
- TMDB metadata enrichment
- SQLite cache layer

**UI Layer:**
- Interactive CLI menus (inquirer)
- Terminal display (blessed)
- mpv integration (spawn with audio track selection)

**Platform-agnostic design** — Core logic can be ported to Fire TV/Android later if needed.

## Quick Start

```bash
# Setup
npm install

# Create .env with credentials
cp .env.example .env
# Edit: XTREAM_SERVER, XTREAM_USER, XTREAM_PASS

# Run
npm start
```

`.env` is gitignored — never commit it. A VPN is recommended but entirely up to you
to set up and run outside this app.

## Status

**Phase 1 (MVP) — done:** Xtream auth, VOD category/movie browsing, series → season →
episode browsing, mpv playback.

**Not yet built:** Trakt/TVTime cross-referencing, title cleanup parser, audio codec
detection/auto-select, SQLite caching.

## Workflow

1. Connects to Xtream server
2. Fetches VOD categories
3. User selects category
4. CLI shows hierarchical menu: Show → Season → Episode
5. User selects episode + audio track
6. mpv opens stream with correct audio track

## Technical Stack

- **Language:** Node.js (ES modules)
- **APIs:** Xtream Codes, Trakt, TMDB
- **Storage:** SQLite3
- **Video:** mpv (spawned via child_process)
- **CLI:** inquirer, blessed
- **Networking:** axios, dotenv

## Features

- ✓ VPN recommended (not enforced or managed by the app)
- ✓ Trakt/TVTime list cross-reference
- ✓ Title parsing (remove metadata junk)
- ✓ Audio codec detection (EAC3 filtering)
- ✓ Language auto-select (country code → audio track)
- ✓ Interactive hierarchical browsing
- ✓ mpv integration
- ✓ Local caching
- ✗ Fire TV sideload (optional future)
- ✗ Playback state sync (future)

## Known Issues

- EAC3 audio streams may not play on all devices (filter/warn)
- Some Xtream servers geo-restrict content by VPN exit IP
- Trakt/TVTime API rate limits on large lists

## Author

Dan Hall