import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

const processes = [
  {
    name: 'backend',
    args: ['--prefix', 'apps/api/backend', 'run', 'dev'],
  },
  {
    name: 'web',
    args: ['--prefix', 'apps/web', 'run', 'dev'],
  },
];

const children = new Set();
let shuttingDown = false;

function start({ name, args }) {
  const child = spawn(npm, args, {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      PORT: process.env.PORT || '4000',
      VITE_API_PROXY_TARGET: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
    },
  });

  children.add(child);

  child.on('exit', (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    console.log(`[dev:${name}] exited with ${signal || code}`);
    shutdown(code || 0);
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(exitCode), 600).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

for (const processConfig of processes) {
  start(processConfig);
}
