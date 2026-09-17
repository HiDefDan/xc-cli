# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/). This
project is still in initial development (`0.y.z`) — anything may change at
any time, per SemVer's own rules for major version zero.

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
