import 'dotenv/config';
import inquirer from 'inquirer';
import { connect, disconnect, interfaceNameFor } from './src/wireguard.js';
import { readBaseline, captureBaseline, verifyVpnActive, getDefaultRouteInterface } from './src/vpnCheck.js';
import { XtreamClient } from './src/xtream.js';
import { runMenu } from './src/cli.js';

const { XTREAM_SERVER, XTREAM_USER, XTREAM_PASS, WG_CONFIG_PATH, VPN_MODE = 'managed' } = process.env;

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing ${name} in .env`);
    process.exit(1);
  }
}
requireEnv('XTREAM_SERVER', XTREAM_SERVER);
requireEnv('XTREAM_USER', XTREAM_USER);
requireEnv('XTREAM_PASS', XTREAM_PASS);

if (VPN_MODE === 'managed') {
  requireEnv('WG_CONFIG_PATH', WG_CONFIG_PATH);
}

let tunnelManaged = false;
let shuttingDown = null;

// Guarded against concurrent callers: a signal arriving while an
// uncaughtException handler (or another signal) is already mid-teardown
// would otherwise race two `wg-quick down` calls against each other.
function shutdown() {
  if (shuttingDown) return shuttingDown;
  shuttingDown = (async () => {
    if (tunnelManaged) {
      try {
        await disconnect(WG_CONFIG_PATH);
      } catch (err) {
        console.error(`Failed to tear down tunnel: ${err.message}`);
      }
    }
  })();
  return shuttingDown;
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, async () => {
    await shutdown();
    process.exit(0);
  });
}

for (const event of ['uncaughtException', 'unhandledRejection']) {
  process.on(event, async (err) => {
    console.error(`Fatal error (${event}):`, err);
    await shutdown();
    process.exit(1);
  });
}

async function ensureBaseline() {
  const existing = await readBaseline();
  if (existing) return;

  console.log('\nNo VPN baseline recorded yet.');
  console.log('This app refuses to talk to your Xtream server unless your public IP');
  console.log('differs from your real (non-VPN) IP, so it needs that baseline once.');
  console.log('It checks your OS default route itself — turn off every VPN (including');
  console.log("Surfshark's own app) and it'll confirm rather than take your word for it.\n");

  for (;;) {
    const iface = await getDefaultRouteInterface();
    const tunnelUp = !!iface && /^(utun|tun|ppp)\d+$/.test(iface);

    if (tunnelUp && VPN_MODE === 'managed' && iface === interfaceNameFor(WG_CONFIG_PATH)) {
      console.log(`Detected our own tunnel ("${iface}") already up — left over from an earlier run`);
      console.log("that didn't shut down cleanly (fixed now, but this one predates the fix).");
      const { autoDown } = await inquirer.prompt([
        { type: 'confirm', name: 'autoDown', message: 'Tear it down automatically?', default: true },
      ]);
      if (autoDown) {
        await disconnect(WG_CONFIG_PATH);
        continue;
      }
    }

    try {
      const info = await captureBaseline();
      console.log(`Baseline recorded: ${info.ip} (${info.org})\n`);
      return;
    } catch (err) {
      console.error(err.message);
      const { retry } = await inquirer.prompt([
        { type: 'confirm', name: 'retry', message: 'Disconnected it? Retry?', default: true },
      ]);
      if (!retry) process.exit(1);
    }
  }
}

async function enforceVpn() {
  const result = await verifyVpnActive();
  if (result.ok) {
    console.log(`VPN verified. Exit IP: ${result.current.ip} (${result.current.org})`);
    return;
  }
  let detail = '';
  if (result.reason === 'no-tunnel-interface') {
    detail = 'No tunnel interface (utun/tun/ppp) is routing real traffic — VPN is not active.';
  } else if (result.reason === 'same-as-baseline') {
    detail = `Current public IP (${result.current.ip}) matches your recorded non-VPN baseline.`;
  } else if (result.reason === 'lookup-failed') {
    detail = `Could not determine current public IP: ${result.error}`;
  }
  throw new Error(`VPN safety check FAILED — refusing to contact the Xtream server. ${detail}`);
}

async function main() {
  await ensureBaseline();

  if (VPN_MODE === 'managed') {
    await connect(WG_CONFIG_PATH);
    tunnelManaged = true;
  } else {
    console.log('VPN_MODE=external — trusting a VPN you manage yourself outside this app.');
  }

  await enforceVpn();

  const client = new XtreamClient({
    server: XTREAM_SERVER,
    username: XTREAM_USER,
    password: XTREAM_PASS,
  });

  console.log('Authenticating with Xtream server...');
  await client.authenticate();
  console.log('Connected.');

  await runMenu(client);
  await shutdown();
}

main().catch(async (err) => {
  console.error(`Fatal error: ${err.message}`);
  await shutdown();
  process.exit(1);
});
