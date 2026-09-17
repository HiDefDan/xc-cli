# TODO / Ideas

Unordered, unfiltered notes on possible future work — not a roadmap, not
commitments, just things worth not forgetting.

## Setup / config

- A guided setup flow for first run: prompt for Xtream creds + TMDB key
  instead of hand-editing `.env`.
- Default language(s) for group/search filtering — currently
  `languageFilter.js` is hardcoded English-first (`GOOD_PREFIXES`); make
  this a user-set preference instead.
- A settings menu in general (came up re: `DOWNLOAD_DIR`) — one place to
  see/change the above instead of only via `.env`.

## Bigger/riskier ideas (see conversation for context, not decided)

- Optional GUI: additive, not a rewrite — a local web server reusing the
  existing modules as-is, `cli.js` is the only presentation-coupled file.
  TMDB already returns poster/backdrop image URLs we don't currently
  capture.
- mpv JSON IPC (`--input-ipc-server`) for real playback control
  (pause/seek/progress) from a GUI, instead of just spawn-and-forget.
