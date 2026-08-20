import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const branch = process.env.CF_PAGES_BRANCH || '';
const publicReady = process.env.PUBLIC_READY === 'true';
const productionBranch = process.env.PRODUCTION_BRANCH || 'main';
const isProductionBranch = branch === productionBranch;

if (branch && !isProductionBranch && publicReady) {
  console.error(`Preview branch '${branch}' cannot build with PUBLIC_READY=true. Configure preview environment with PUBLIC_READY=false.`);
  process.exit(1);
}

const verifyProduction = isProductionBranch && publicReady;
console.log(`Cloudflare build gate: branch=${branch || 'unknown'}, publicReady=${publicReady}, strict=${verifyProduction}`);

const result = spawnSync(npmCommand, ['run', 'verify'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VERIFY_PRODUCTION: verifyProduction ? 'true' : 'false'
  }
});

process.exit(result.status ?? 1);
