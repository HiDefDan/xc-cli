import axios from 'axios';

/**
 * Downloads from the actual stream URL for a short window to measure real
 * throughput over the current network path — more meaningful than a
 * generic speed test, since it hits the exact server/route mpv would use
 * (through the VPN if one's active, same as playback would be).
 */
export async function measureStreamSpeed(url, { durationMs = 3000, maxBytes = 8 * 1024 * 1024 } = {}) {
  const response = await axios.get(url, { responseType: 'stream', timeout: 15000 });

  return new Promise((resolve, reject) => {
    let bytes = 0;
    const start = Date.now();
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      response.data.destroy(); // we only wanted a sample, not the whole file
      const elapsedSec = (Date.now() - start) / 1000;
      resolve({ bytes, elapsedSec, bytesPerSec: bytes / elapsedSec });
    };

    const timer = setTimeout(finish, durationMs);
    response.data.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes >= maxBytes) {
        clearTimeout(timer);
        finish();
      }
    });
    response.data.on('error', (err) => {
      clearTimeout(timer);
      if (!done) {
        done = true;
        reject(err);
      }
    });
    response.data.on('end', () => {
      clearTimeout(timer);
      finish();
    });
  });
}
