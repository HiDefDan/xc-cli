import 'dotenv/config';
import { XtreamClient } from './src/xtream.js';
import { runMenu } from './src/cli.js';
import { abandonAll } from './src/downloadManager.js';

// A killed process never reaches downloadStream's own catch-block
// cleanup, so a Ctrl+C mid-download would otherwise leave a stray partial
// file behind (true even before background downloads existed — this
// closes a pre-existing gap, not one introduced by backgrounding).
process.on('SIGINT', async () => {
  await abandonAll();
  process.exit(130); // 128 + SIGINT's signal number 2, standard convention
});

const { XTREAM_SERVER, XTREAM_USER, XTREAM_PASS } = process.env;

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing ${name} in .env`);
    process.exit(1);
  }
}
requireEnv('XTREAM_SERVER', XTREAM_SERVER);
requireEnv('XTREAM_USER', XTREAM_USER);
requireEnv('XTREAM_PASS', XTREAM_PASS);

console.log('Recommended: use a VPN. Xtream Codes credentials are usually tied to a');
console.log("single IP, and providers may flag or block access from multiple ones.");
console.log("This app doesn't manage or check your VPN — that's on you.\n");

async function main() {
  const client = new XtreamClient({
    server: XTREAM_SERVER,
    username: XTREAM_USER,
    password: XTREAM_PASS,
  });

  console.log('Authenticating with Xtream server...');
  await client.authenticate();
  console.log('Connected.');

  await runMenu(client);
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
