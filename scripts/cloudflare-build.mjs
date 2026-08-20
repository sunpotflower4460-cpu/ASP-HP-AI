import './lib/load-local-env.mjs';
import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const branch = process.env.CF_PAGES_BRANCH || '';
const publicReady = process.env.PUBLIC_READY === 'true';
const productionBranch = process.env.PRODUCTION_BRANCH || 'main';
const isProductionBranch = branch === productionBranch;
const isKnownPreviewBranch = Boolean(branch) && !isProductionBranch;

if (isKnownPreviewBranch && publicReady) {
  console.error(`Preview branch '${branch}' cannot build with PUBLIC_READY=true. Configure preview environment with PUBLIC_READY=false.`);
  process.exit(1);
}

// PUBLIC_READY=true is always treated as a strict production-intent build unless
// Cloudflare explicitly identifies the branch as a preview (which is rejected above).
// This keeps local/manual builds safe even when CF_PAGES_BRANCH is unavailable.
const verifyProduction = publicReady && !isKnownPreviewBranch;
console.log(`Cloudflare build gate: branch=${branch || 'unknown'}, publicReady=${publicReady}, strict=${verifyProduction}`);

const result = spawnSync(npmCommand, ['run', 'verify'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VERIFY_PRODUCTION: verifyProduction ? 'true' : 'false'
  }
});

process.exit(result.status ?? 1);
