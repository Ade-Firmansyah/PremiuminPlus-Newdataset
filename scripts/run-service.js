import { spawn } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { freePortForDev, isPortOpen } from './dev-port.js';

dotenv.config();

const root = process.cwd();
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const serviceName = process.argv[2] || '';
const configs = {
  backend: {
    name: 'backend',
    port: Number(process.env.PORT || 4000),
    command: process.execPath,
    args: ['backend/server.js'],
  },
  bot: {
    name: 'bot-engine',
    port: Number(process.env.BOT_ENGINE_PORT || 4010),
    command: process.execPath,
    args: ['bot-engine/index.js'],
  },
  frontend: {
    name: 'frontend',
    port: Number(process.env.FRONTEND_PORT || 3000),
    command: process.execPath,
    args: [viteCli, '--port', String(process.env.FRONTEND_PORT || 3000), '--host', '0.0.0.0', '--strictPort'],
  },
};

const service = configs[serviceName];
if (!service) {
  console.error(`[dev] Unknown service "${serviceName}". Use backend, bot, or frontend.`);
  process.exit(1);
}

if (await isPortOpen(service.port)) {
  await freePortForDev(service, { logPrefix: service.name });
}

if (await isPortOpen(service.port)) {
  console.error(`[${service.name}] port ${service.port} is still busy. Set PREMIUMIN_AUTO_KILL_PORTS=true or stop the old process manually.`);
  process.exit(1);
}

const child = spawn(service.command, service.args, {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
  windowsHide: false,
});

const shutdown = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 0 : 1));
});
