import './lib/load-local-env.mjs';
import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const retries = Number(process.env.REMOTE_SMOKE_RETRIES || 6);
const delayMs = Number(process.env.REMOTE_SMOKE_RETRY_DELAY_MS || 20000);

if (!Number.isInteger(retries) || retries < 1 || retries > 20) {
  throw new Error('REMOTE_SMOKE_RETRIES must be an integer from 1 to 20.');
}
if (!Number.isInteger(delayMs) || delayMs < 1000 || delayMs > 60000) {
  throw new Error('REMOTE_SMOKE_RETRY_DELAY_MS must be an integer from 1000 to 60000.');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastStatus = 1;

for (let attempt = 1; attempt <= retries; attempt += 1) {
  console.log(`Post-push remote verification attempt ${attempt}/${retries}.`);
  const result = spawnSync(npmCommand, ['run', 'remote:smoke'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      REMOTE_EXPECT_PUBLIC: process.env.REMOTE_EXPECT_PUBLIC || 'true',
      // A post-push verification is specifically checking that Cloudflare has
      // reached the commit we just pushed, not merely that some older site is healthy.
      REMOTE_REQUIRE_COMMIT_MATCH: 'true'
    }
  });
  lastStatus = result.status ?? 1;
  if (lastStatus === 0) {
    console.log('Post-push remote verification passed for the current local HEAD.');
    process.exit(0);
  }
  if (attempt < retries) await sleep(delayMs);
}

console.error('Post-push remote verification did not observe a healthy deployment of the current HEAD within the configured retry window.');
process.exit(lastStatus || 1);
