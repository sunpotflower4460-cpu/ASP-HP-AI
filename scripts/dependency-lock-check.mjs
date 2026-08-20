import fs from 'node:fs';

const failures = [];
if (!fs.existsSync('package-lock.json')) {
  failures.push('package-lock.json is missing. Generate and commit it before initial public launch.');
} else {
  let lock;
  let pkg;
  try { lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8')); }
  catch { failures.push('package-lock.json is invalid JSON.'); }
  try { pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); }
  catch { failures.push('package.json is invalid JSON.'); }

  if (lock && pkg) {
    if (!Number.isInteger(Number(lock.lockfileVersion)) || Number(lock.lockfileVersion) < 3) {
      failures.push(`package-lock.json lockfileVersion ${lock.lockfileVersion ?? '?'} is older than expected for the Node 22/npm 10 toolchain.`);
    }
    const root = lock.packages?.[''];
    if (!root) {
      failures.push('package-lock.json does not contain the root package entry.');
    } else {
      if (root.name && root.name !== pkg.name) failures.push(`lock root name '${root.name}' does not match package.json '${pkg.name}'.`);
      if (root.version && root.version !== pkg.version) failures.push(`lock root version '${root.version}' does not match package.json '${pkg.version}'.`);

      for (const section of ['dependencies', 'devDependencies']) {
        const expected = pkg[section] || {};
        const locked = root[section] || {};
        for (const [name, version] of Object.entries(expected)) {
          if (locked[name] !== version) {
            failures.push(`package-lock root ${section}.${name}='${locked[name] ?? '<missing>'}' does not match package.json '${version}'.`);
          }
        }
      }
    }
  }
}

if (failures.length) {
  console.error(`Dependency lock check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('Dependency lock check passed.');
