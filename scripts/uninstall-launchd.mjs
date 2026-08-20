import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.platform !== 'darwin') {
  console.error('launchd uninstaller is only supported on macOS.');
  process.exit(1);
}

const label = 'com.asphpai.daily';
const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
const uid = process.getuid?.();
if (uid == null) throw new Error('Could not determine macOS user id.');

if (fs.existsSync(plistPath)) {
  spawnSync('launchctl', ['bootout', `gui/${uid}`, plistPath], { stdio: 'ignore' });
  fs.unlinkSync(plistPath);
}
console.log(`Removed ${label}.`);
