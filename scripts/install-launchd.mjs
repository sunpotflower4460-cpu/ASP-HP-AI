import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, '.env.local'));

if (process.platform !== 'darwin') {
  console.error('launchd installer is only supported on macOS. Run npm run local:daily from another scheduler on other OSes.');
  process.exit(1);
}

const doctor = spawnSync(process.execPath, [path.join(root, 'scripts', 'local-doctor.mjs')], {
  cwd: root,
  env: process.env,
  stdio: 'inherit'
});
if (doctor.status !== 0) {
  console.error('Local doctor did not pass; launchd installation aborted.');
  process.exit(doctor.status || 1);
}

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
