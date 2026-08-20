import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.platform !== 'darwin') {
  console.error('launchd installer is only supported on macOS. Run npm run local:daily from another scheduler on other OSes.');
  process.exit(1);
}

const root = process.cwd();
const label = 'com.asphpai.daily';
const hour = Math.max(0, Math.min(23, Number(process.env.LOCAL_SCHEDULE_HOUR || 7)));
const minute = Math.max(0, Math.min(59, Number(process.env.LOCAL_SCHEDULE_MINUTE || 20)));
const launchAgents = path.join(os.homedir(), 'Library', 'LaunchAgents');
const plistPath = path.join(launchAgents, `${label}.plist`);
const logsDir = path.join(root, 'logs');
fs.mkdirSync(launchAgents, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });

const xmlEscape = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(process.execPath)}</string>
    <string>${xmlEscape(path.join(root, 'scripts', 'local-daily.mjs'))}</string>
  </array>
  <key>WorkingDirectory</key><string>${xmlEscape(root)}</string>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>
  <key>StandardOutPath</key><string>${xmlEscape(path.join(logsDir, 'launchd.out.log'))}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(path.join(logsDir, 'launchd.err.log'))}</string>
  <key>RunAtLoad</key><false/>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
`;

fs.writeFileSync(plistPath, plist);
const uid = process.getuid?.();
if (uid == null) throw new Error('Could not determine macOS user id.');
spawnSync('launchctl', ['bootout', `gui/${uid}`, plistPath], { stdio: 'ignore' });
const result = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, plistPath], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
console.log(`Installed ${label} at ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} local time.`);
console.log(`Config: ${plistPath}`);
