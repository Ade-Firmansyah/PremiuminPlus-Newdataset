import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

const targets = [
  'run-all.log',
  'run-all.err',
  'backend-run.log',
  'backend-run.err',
  'backend-final-smoke.log',
  'backend-final-smoke.err',
  'frontend-dev-smoke.log',
  'frontend-dev-smoke.err',
  'bot-engine-smoke.log',
  'bot-engine-smoke.err',
  'npm-debug.log',
  'yarn-debug.log',
  'yarn-error.log',
  'pnpm-debug.log',
];

function insideRoot(target) {
  const absolute = resolve(root, target);
  return absolute === root || absolute.startsWith(`${root}\\`) || absolute.startsWith(`${root}/`);
}

for (const target of targets) {
  if (!insideRoot(target)) continue;
  const absolute = resolve(root, target);
  if (existsSync(absolute)) {
    rmSync(absolute, { force: true });
    console.log(`[CLEAN] removed ${target}`);
  }
}

console.log('[CLEAN] runtime logs cleaned. Bot sessions are kept intact.');
