import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distAssets = path.join(root, 'dist', 'assets');

const compatAssets = {
  DashboardPage: ['DashboardPage-C5vLuf0-.js'],
};

if (!fs.existsSync(distAssets)) {
  console.warn('[compat-assets] dist/assets not found, skipped.');
  process.exit(0);
}

for (const [prefix, legacyNames] of Object.entries(compatAssets)) {
  const current = fs
    .readdirSync(distAssets)
    .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith('.js'))
    .sort()
    .at(-1);

  if (!current) {
    console.warn(`[compat-assets] ${prefix} chunk not found, skipped.`);
    continue;
  }

  const source = path.join(distAssets, current);
  for (const legacyName of legacyNames) {
    const destination = path.join(distAssets, legacyName);
    if (legacyName === current) continue;
    fs.copyFileSync(source, destination);
    console.log(`[compat-assets] ${legacyName} -> ${current}`);
  }
}
