# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/). This
project is still in initial development (`0.y.z`) — anything may change at
any time, per SemVer's own rules for major version zero.

## [0.4.0] - 2026-09-17

### Added
- "Check stream speed" for movies (search results and watchlist): probes
  real throughput against the file's actual stream URL for ~3s and
  compares it to the bitrate `get_vod_info` already reports, so
  "will this buffer?" has a real answer instead of a guess.

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
