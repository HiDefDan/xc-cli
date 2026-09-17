import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import axios from 'axios';

const execFileAsync = promisify(execFile);
const BASELINE_PATH = path.resolve('data/network-baseline.json');

async function fetchIpInfo() {
  const res = await axios.get('https://ipwho.is/', { timeout: 8000 });
  if (!res.data.success) throw new Error(res.data.message || 'IP lookup failed');
  return { ip: res.data.ip, org: res.data.connection?.isp || res.data.connection?.org || 'unknown' };
}

/**
 * OS-level ground truth, independent of any self-report or stored file:
 * what interface macOS actually routes ordinary internet traffic through
 * right now. Deliberately NOT `route get default` — wg-quick's full-tunnel
 * mode doesn't touch the literal default route, it installs two
 * more-specific halves (0.0.0.0/1 and 128.0.0.0/1) that outrank it, so the
 * "default" entry keeps pointing at the old interface even while every
 * real destination now resolves through the tunnel. Asking the routing
 * table how it resolves an actual public IP reflects that override; asking
 * for "default" doesn't. WireGuard (and every other NetworkExtension VPN,
 * including Surfshark's own app) uses a utunN interface; plain Wi-Fi/
 * Ethernet is en0/en1/etc.
 */
export async function getDefaultRouteInterface() {
  try {
    const { stdout } = await execFileAsync('route', ['-n', 'get', '1.1.1.1']);
    const match = stdout.match(/interface:\s*(\S+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export async function isTunnelInterfaceActive() {
  const iface = await getDefaultRouteInterface();
  return !!iface && /^(utun|tun|ppp)\d+$/.test(iface);
}

export async function readBaseline() {
  try {
    return JSON.parse(await readFile(BASELINE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Refuses to record a baseline unless the OS confirms no tunnel interface
 * is currently the default route — a self-reported "VPN is off" is not
 * trusted on its own, since a wrong answer here would poison the baseline
 * with a VPN IP and invert the safety check for good (real IP would then
 * look "different from baseline" and pass with the VPN OFF).
 */
export async function captureBaseline() {
  if (await isTunnelInterfaceActive()) {
    const iface = await getDefaultRouteInterface();
    throw new Error(
      `Default route is still going through "${iface}" — a VPN/tunnel interface. ` +
        'Disconnect it fully before capturing a baseline.'
    );
  }
  const info = await fetchIpInfo();
  await mkdir(path.dirname(BASELINE_PATH), { recursive: true });
  await writeFile(BASELINE_PATH, JSON.stringify({ ...info, capturedAt: new Date().toISOString() }, null, 2));
  return info;
}

/**
 * Hard safety net gating every piece of Xtream traffic. Requires BOTH:
 *  - an OS-level tunnel interface is the current default route, and
 *  - the live public IP differs from the recorded non-VPN baseline.
 * Neither signal is trusted alone: the interface check catches a poisoned
 * or stale baseline, the IP-diff check catches a tunnel that's up but not
 * actually routing traffic (e.g. misconfigured AllowedIPs).
 */
export async function verifyVpnActive() {
  const baseline = await readBaseline();
  if (!baseline) {
    return { ok: false, reason: 'no-baseline' };
  }

  const tunnelUp = await isTunnelInterfaceActive();
  if (!tunnelUp) {
    return { ok: false, reason: 'no-tunnel-interface' };
  }

  let current;
  try {
    current = await fetchIpInfo();
  } catch (err) {
    return { ok: false, reason: 'lookup-failed', error: err.message };
  }
  if (current.ip === baseline.ip) {
    return { ok: false, reason: 'same-as-baseline', current, baseline };
  }
  return { ok: true, current, baseline };
}
