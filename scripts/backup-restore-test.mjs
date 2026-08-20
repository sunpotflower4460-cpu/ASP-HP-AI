import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceRoot = path.resolve('.');
const backupScript = path.join(sourceRoot, 'scripts', 'local-backup-safe.mjs');
const restoreScript = path.join(sourceRoot, 'scripts', 'local-backup-restore.mjs');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'asp-hp-ai-restore-test-'));
const repo = path.join(fixture, 'repo');
const backupRoot = path.join(fixture, 'private-backups');

function write(relative, value) {
  const target = path.join(repo, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function run(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repo,
    env: {
      ...process.env,
      LOCAL_BACKUP_DIR: backupRoot,
      LOCAL_BACKUP_RETENTION_DAYS: '30'
    },
    encoding: 'utf8'
  });
}

try {
  write('data/search-console/latest.json', '{"version":"original-gsc"}\n');
  write('data/analytics/latest.json', '{"version":"original-ga"}\n');
  write('data/affiliate/normalized-latest.json', '{"version":"original-affiliate"}\n');
  write('data/ai-usage/2026-08.json', '{"calls":3}\n');
  write('reports/latest.json', '{"version":"original-report"}\n');

  const backup = run(backupScript);
  assert.equal(backup.status, 0, `backup should succeed: ${backup.stderr || backup.stdout}`);

  write('data/search-console/latest.json', '{"version":"mutated-gsc"}\n');
  write('reports/latest.json', '{"version":"mutated-report"}\n');

  const restore = run(restoreScript, ['--latest', '--confirm']);
  assert.equal(restore.status, 0, `restore should succeed: ${restore.stderr || restore.stdout}`);
  assert.match(fs.readFileSync(path.join(repo, 'data/search-console/latest.json'), 'utf8'), /original-gsc/);
  assert.match(fs.readFileSync(path.join(repo, 'reports/latest.json'), 'utf8'), /original-report/);
  assert.ok(fs.existsSync(path.join(repo, 'reports/restore-report.json')), 'restore report should be written');

  const latest = JSON.parse(fs.readFileSync(path.join(backupRoot, 'latest.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(latest.snapshot, 'manifest.json'), 'utf8'));
  const tamperItem = manifest.files.find((item) => item.path === 'data/search-console/latest.json');
  assert.ok(tamperItem, 'fixture snapshot should contain GSC file');
  fs.writeFileSync(path.join(latest.snapshot, tamperItem.path), '{"tampered":true}\n');

  write('data/search-console/latest.json', '{"version":"must-survive-failed-restore"}\n');
  const failedRestore = run(restoreScript, ['--latest', '--confirm']);
  assert.notEqual(failedRestore.status, 0, 'tampered snapshot restore must fail');
  assert.match(
    fs.readFileSync(path.join(repo, 'data/search-console/latest.json'), 'utf8'),
    /must-survive-failed-restore/,
    'current local data must remain untouched when backup verification fails'
  );

  const unconfirmed = run(restoreScript, ['--latest']);
  assert.notEqual(unconfirmed.status, 0, 'restore without --confirm must fail');

  console.log('Backup restore test passed.');
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
