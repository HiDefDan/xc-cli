# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/). This
project is still in initial development (`0.y.z`) — anything may change at
any time, per SemVer's own rules for major version zero.

## [0.5.0] - 2026-09-18

### Changed
- Top-level menu reorganized: `Watchlist`, `Search`, `Browse`, `Settings`
  — no more separate `Movies`/`Series` items (now a bare Movies/Series
  chooser under `Browse`, mirroring the Watchlist chooser's shape) and
  no visible `Quit` row (the existing double Escape/Left "press again to
  quit" arm-to-quit already covers it, consistently with how Escape/Left
  means "back" everywhere else in the app).
- "Build Full Search Index" moved under the new `Settings` screen and
  renamed "(Re)build full search index — update catalog (slow)".

## [0.4.2] - 2026-09-18

### Fixed
- `BackableListPrompt`'s collapsed-line display (the line shown after a
  menu is answered) fell back to showing the currently-highlighted
  choice's name when Escape/Left was pressed on a menu with no explicit
  "← Back"/Quit choice to point at — misleadingly looking like that item
  had been chosen. Now shows "← Back" in that case instead.

## [0.4.1] - 2026-09-17

### Reverted
- The stream speed check added in 0.4.0 (`src/speedtest.js`, "Check
  stream speed" for movies). Built and shipped without discussing the
  approach first — reverted to go through it properly. See `TODO.md`.

## [0.3.1] - 2026-09-17

### Fixed
- mpv would start playback immediately and only enter its "buffering"
  state after the network stream underran a moment later — a jarring
  "playing then suddenly frozen" sequence, especially fullscreen with no
  window chrome visible for reassurance. Now buffers up front
  (`--cache-pause-initial=yes`) so the first thing shown is one
  continuous, expected buffering state instead.

## [0.3.0] - 2026-09-17

### Changed
- VPN use is now recommended, not enforced. The app no longer verifies,
  manages, or requires a VPN connection before contacting the Xtream
  server — only a one-time startup message recommends running one.

### Removed
- WireGuard tunnel lifecycle management (`wg-quick up`/`down`), VPN baseline
  IP capture/comparison, and the `requireVpn()` gate that previously blocked
  every play/download/search call until a tunnel was confirmed active.
- `WG_CONFIG_PATH` and `VPN_MODE` environment variables.

### Fixed
- Removed a macOS-only `route -n get` call (used by the old VPN check) that
  would have failed outright on Linux.

## [0.2.0] - 2026-09-17

### Added
- TMDB as the metadata provider, replacing TVmaze — now also covers movies
  (TVmaze had no movie data), merging duplicate sources whose titles differ
  slightly across providers.
- Download option alongside Play, for both movies and series episodes,
  saving to `DOWNLOAD_DIR` with live progress and cleanup on failure.

### Changed
- Series episode-completeness ranking now sourced from TMDB instead of
  TVmaze.

## [0.1.0] - 2026-09-17

### Added
- Initial release: Xtream Codes VOD CLI player with WireGuard-enforced VPN
  connectivity, cached/deduplicated catalog search with TVmaze-assisted
  ranking, mpv playback, and a local watchlist.
- MIT license.
