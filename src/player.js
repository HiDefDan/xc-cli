import { spawn } from 'node:child_process';

// mpv's own exit code for "could not open/fetch the file" (confirmed via
// `mpv --no-config <missing-file>`), distinct from 0 (normal quit/EOF) —
// the only exit code worth reacting to by trying a different source.
export const MPV_FETCH_FAILED = 2;

export function play(streamUrl, { mpvPath = 'mpv', title } = {}) {
  return new Promise((resolve, reject) => {
    const windowMode = process.env.MPV_WINDOW_MODE || 'fit'; // 'fit' | 'fullscreen' | 'native'
    // Without this, mpv starts playback immediately and only shows its
    // "buffering" state after the stream underruns a moment later — a
    // jarring "playing then suddenly frozen" sequence that's easy to
    // mistake for a crash, especially fullscreen with no window chrome
    // visible for reassurance. This makes it buffer up front instead, so
    // the first thing you see is one continuous, expected buffering state.
    const args = ['--force-window=yes', '--cache-pause-initial=yes'];
    if (windowMode === 'fullscreen') {
      args.push('--fs=yes');
    } else if (windowMode === 'fit') {
      args.push('--fs=no', '--autofit=90%x90%');
    } else {
      args.push('--fs=no');
    }
    if (title) args.push(`--title=${title}`);
    args.push(streamUrl);

    const child = spawn(mpvPath, args, { stdio: 'inherit' });
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`mpv not found at "${mpvPath}". Install it with: brew install mpv`));
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => resolve(code));
  });
}
