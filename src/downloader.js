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

/** Downloads a stream URL to DOWNLOAD_DIR with live progress, removing the partial file if the download fails or is interrupted. */
export async function downloadStream(url, filename) {
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  const destPath = path.join(DOWNLOAD_DIR, sanitizeFilename(filename));

  const response = await axios.get(url, { responseType: 'stream', timeout: 15000 });
  const total = Number(response.headers['content-length']) || null;
  let downloaded = 0;

  const writer = createWriteStream(destPath);
  response.data.on('data', (chunk) => {
    downloaded += chunk.length;
    const mb = (downloaded / 1024 / 1024).toFixed(1);
    const progress = total
      ? `${mb}MB / ${(total / 1024 / 1024).toFixed(1)}MB (${((downloaded / total) * 100).toFixed(0)}%)`
      : `${mb}MB`;
    process.stdout.write(`\r  Downloading... ${progress}`);
  });

  try {
    await new Promise((resolve, reject) => {
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
      response.data.on('error', reject);
    });
    process.stdout.write('\n');
    console.log(`Saved: ${destPath}`);
    return destPath;
  } catch (err) {
    process.stdout.write('\n');
    writer.close();
    await unlink(destPath).catch(() => {});
    throw err;
  }
}
