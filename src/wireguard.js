import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import path from 'node:path';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}: ${stderr.trim()}`));
    });
  });
}

/**
 * wg-quick names the interface after the config file's basename (e.g.
 * surfshark.conf -> interface "surfshark"), not anything we choose
 * ourselves. Deriving it from the same path we pass to wg-quick keeps the
 * two from drifting apart — a hardcoded/env-configured name did exactly
 * that and caused wg-quick to collide with a tunnel it already owned.
 */
export function interfaceNameFor(configPath) {
  return path.basename(configPath, path.extname(configPath));
}

export async function isTunnelUp(configPath) {
  const iface = interfaceNameFor(configPath);
  try {
    await run('sudo', ['wg', 'show', iface]);
    return true;
  } catch {
    return false;
  }
}

export async function connect(configPath) {
  await access(configPath, constants.R_OK);
  const iface = interfaceNameFor(configPath);
  if (await isTunnelUp(configPath)) {
    console.log(`WireGuard tunnel (${iface}) already up.`);
    return;
  }
  console.log(`Bringing up WireGuard tunnel (${iface})... you may be prompted for your password.`);
  try {
    await run('sudo', ['wg-quick', 'up', configPath]);
  } catch (err) {
    if (/already exists/.test(err.message)) {
      console.log(`WireGuard tunnel (${iface}) was already up.`);
      return;
    }
    throw err;
  }
}

export async function disconnect(configPath) {
  const iface = interfaceNameFor(configPath);
  // isTunnelUp() itself needs sudo (it runs `wg show`), so the password
  // prompt can appear before we've even confirmed there's anything to
  // tear down — warn up front rather than let it show up unannounced.
  console.log(`Checking WireGuard tunnel (${iface})... you may be prompted for your password.`);
  if (!(await isTunnelUp(configPath))) return;
  console.log(`Tearing down WireGuard tunnel (${iface})...`);
  await run('sudo', ['wg-quick', 'down', configPath]);
}

export async function currentPublicIp() {
  const { default: axios } = await import('axios');
  const res = await axios.get('https://api.ipify.org?format=json', { timeout: 8000 });
  return res.data.ip;
}
