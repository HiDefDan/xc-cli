import { unlink } from 'node:fs/promises';
import inquirer from 'inquirer';
import { downloadStream, getDestPath } from './downloader.js';

// Process-lifetime only, deliberately not persisted to data/ like
// watchlist.js/searchState.js — a download's progress has no meaning
// after the process that was streaming it exits.
const downloads = new Map();
let nextId = 1;

export function hasActiveDownload() {
  return [...downloads.values()].some((d) => d.status === 'downloading');
}

export function listDownloads() {
  return [...downloads.values()].sort((a, b) => a.startedAt - b.startedAt);
}

export function clearFinished() {
  for (const [id, d] of downloads) {
    if (d.status !== 'downloading') downloads.delete(id);
  }
}

/** Best-effort cleanup of files still mid-transfer — for SIGINT, since a killed process never reaches downloadStream's own catch-block cleanup. */
export async function abandonAll() {
  const inFlight = [...downloads.values()].filter((d) => d.status === 'downloading');
  await Promise.all(inFlight.map((d) => unlink(d.destPath).catch(() => {})));
}

/**
 * Registers and starts a download without awaiting the transfer itself —
 * resolves as soon as it's safely running in the background, so callers
 * (the download menus) can return to browsing almost immediately instead
 * of blocking until the whole file finishes.
 */
export async function startDownload(url, filename, title) {
  const alreadyRunning = [...downloads.values()].some((d) => d.filename === filename && d.status === 'downloading');
  if (alreadyRunning) {
    console.log(`Already downloading "${title}".`);
    return;
  }

  if (hasActiveDownload()) {
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        default: false,
        message: 'Another download is already in progress — start this one too? (your account may only support one active stream)',
      },
    ]);
    if (!proceed) return;
  }

  const record = {
    id: nextId++,
    filename,
    title,
    status: 'downloading',
    downloaded: 0,
    total: null,
    destPath: getDestPath(filename),
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
  };
  downloads.set(record.id, record);

  // Attached synchronously, before this function returns — nothing needs
  // to await record.promise for a rejection to be considered handled, so
  // there's no unhandled-rejection risk from firing this without `await`.
  record.promise = downloadStream(url, filename, {
    onProgress: (downloaded, total) => {
      record.downloaded = downloaded;
      record.total = total;
    },
  })
    .then((destPath) => {
      record.status = 'done';
      record.destPath = destPath;
      record.finishedAt = Date.now();
    })
    .catch((err) => {
      record.status = 'failed';
      record.error = err.message;
      record.finishedAt = Date.now();
    });

  console.log(`Downloading in the background: ${title}`);
}
