import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import { freePortForDev, isPortOpen } from './dev-port.js';

dotenv.config();

const isWindows = process.platform === 'win32';
const npmBin = isWindows ? process.env.ComSpec || 'cmd.exe' : 'npm';
const services = [
  { name: 'backend', script: 'backend', port: Number(process.env.PORT || 4000) },
  { name: 'bot', script: 'bot', port: Number(process.env.BOT_ENGINE_PORT || 4010) },
  { name: 'frontend', script: 'dev', port: Number(process.env.FRONTEND_PORT || 3000) },
];

const children = [];

function prefixLines(name, chunk, writer) {
  const text = String(chunk);
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) writer(`[${name}] ${line}\n`);
  }
}

function startService(service) {
  const args = isWindows ? ['/d', '/s', '/c', `npm run ${service.script}`] : ['run', service.script];
  const child = spawn(npmBin, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout.on('data', (chunk) => prefixLines(service.name, chunk, process.stdout.write.bind(process.stdout)));
  child.stderr.on('data', (chunk) => prefixLines(service.name, chunk, process.stderr.write.bind(process.stderr)));
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[all] ${service.name} stopped (${signal || code}). Stopping remaining services.`);
    shutdown(code || 1);
  });

  children.push(child);
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(code), 400).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(`[all] Starting Premiumin Plus stack: backend ${services[0].port}, bot-engine ${services[1].port}, frontend ${services[2].port}`);
for (const service of services) {
  if (await isPortOpen(service.port)) {
    const stopped = await freePortForDev(service, { logPrefix: 'all' });
    if (!stopped && (await isPortOpen(service.port))) {
      console.log(`[all] ${service.name} already listening on ${service.port}; skipping start.`);
      continue;
    }
    if (await isPortOpen(service.port)) {
      console.log(`[all] ${service.name} port ${service.port} still busy after safe cleanup; skipping start.`);
      continue;
    }
  }
  startService(service);
}

if (!children.length) {
  console.log('[all] All services are already running.');
}

