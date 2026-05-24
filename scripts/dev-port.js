import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';

const execFileAsync = promisify(execFile);
const isWindows = process.platform === 'win32';

export function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const done = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(700);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

export async function listPortOwners(port) {
  if (isWindows) {
    const command = `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" -ErrorAction SilentlyContinue; if ($p) { "$($p.ProcessId)|$($p.CommandLine)" } }`;
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true }).catch(() => ({ stdout: '' }));
    return String(stdout)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [pid, ...rest] = line.split('|');
        return { pid: Number(pid), command: rest.join('|') };
      })
      .filter((item) => Number.isFinite(item.pid));
  }

  const { stdout } = await execFileAsync('sh', ['-lc', `lsof -nP -iTCP:${port} -sTCP:LISTEN -Fp -Fc 2>/dev/null || true`]).catch(() => ({ stdout: '' }));
  const owners = [];
  let pid = 0;
  for (const line of String(stdout).split(/\r?\n/)) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    if (line.startsWith('c')) {
      if (pid) owners.push({ pid, command: line.slice(1) });
      pid = 0;
    }
  }
  return owners;
}

export function isSafeDevOwner(owner) {
  const command = String(owner.command || '').toLowerCase();
  if (!owner.pid || owner.pid === process.pid) return false;
  return (
    command.includes('premiuminplus-web') ||
    command.includes('backend/server.js') ||
    command.includes('bot-engine/index.js') ||
    command.includes('vite') ||
    command.includes('npm')
  );
}

async function waitForPortClosed(port, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!(await isPortOpen(port))) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return !(await isPortOpen(port));
}

export async function freePortForDev(service, { logPrefix = 'dev' } = {}) {
  const autoKillPorts = String(process.env.PREMIUMIN_AUTO_KILL_PORTS || 'true').toLowerCase() !== 'false';
  if (!autoKillPorts) return false;

  const owners = await listPortOwners(service.port);
  const safeOwners = owners.filter(isSafeDevOwner);
  if (!safeOwners.length) return false;

  for (const owner of safeOwners) {
    console.log(`[${logPrefix}] stopping previous ${service.name} on ${service.port}: pid ${owner.pid}`);
    try {
      process.kill(owner.pid, 'SIGTERM');
    } catch {
      // Process may already be gone.
    }
  }

  if (await waitForPortClosed(service.port, 2500)) return true;

  for (const owner of safeOwners) {
    console.log(`[${logPrefix}] force stopping previous ${service.name} on ${service.port}: pid ${owner.pid}`);
    try {
      process.kill(owner.pid, 'SIGKILL');
    } catch {
      // Process may already be gone.
    }
  }

  return waitForPortClosed(service.port, 2500);
}
