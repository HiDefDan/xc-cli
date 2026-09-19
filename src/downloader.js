import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import axios from 'axios';

// dotenv doesn't expand "~" the way a shell would, so DOWNLOAD_DIR=~/... in
// .env would otherwise become a literal "~" directory under the cwd.
function resolveDownloadDir(raw) {
  if (!raw) return path.join(os.homedir(), 'Downloads', 'xc-cli');
  if (raw === '~') return os.homedir();
  if (raw.startsWith('~/')) return path.join(os.homedir(), raw.slice(2));
  return raw;
}

const DOWNLOAD_DIR = resolveDownloadDir(process.env.DOWNLOAD_DIR);

function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '-').trim();
}

/** Deterministic from filename alone — lets a caller know where a download will land before (or without) awaiting it, e.g. to clean up a still-in-flight file on SIGINT. */
export function getDestPath(filename) {
  return path.join(DOWNLOAD_DIR, sanitizeFilename(filename));
}

/** Formats a downloaded/total byte pair as a human-readable progress string, e.g. "12.3MB / 45.6MB (27%)" or just "12.3MB" when total is unknown. */
export function formatProgress(downloaded, total) {
  const mb = (downloaded / 1024 / 1024).toFixed(1);
  return total
    ? `${mb}MB / ${(total / 1024 / 1024).toFixed(1)}MB (${((downloaded / total) * 100).toFixed(0)}%)`
    : `${mb}MB`;
}

/**
 * Downloads a stream URL to DOWNLOAD_DIR, removing the partial file if the
 * download fails or is interrupted. Pure I/O — no terminal output of its
 * own (callers may run this in the background while a menu prompt is
 * actively rendering, and a raw terminal write here would corrupt that);
 * progress is reported via onProgress(downloaded, total) instead.
 */
export async function downloadStream(url, filename, { onProgress } = {}) {
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  const destPath = getDestPath(filename);

  const response = await axios.get(url, { responseType: 'stream', timeout: 15000 });
  const total = Number(response.headers['content-length']) || null;
  let downloaded = 0;

  const writer = createWriteStream(destPath);
  response.data.on('data', (chunk) => {
    downloaded += chunk.length;
    onProgress?.(downloaded, total);
  });

  try {
    await new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
      response.data.on('error', reject);
    });
    return destPath;
  } catch (err) {
    writer.close();
    await unlink(destPath).catch(() => {});
    throw err;
  }
}
