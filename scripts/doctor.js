import dotenv from 'dotenv';
import http from 'node:http';
import net from 'node:net';
import mysql from 'mysql2/promise';

dotenv.config();

const config = {
  frontendPort: Number(process.env.FRONTEND_PORT || 3000),
  backendPort: Number(process.env.PORT || 4000),
  botPort: Number(process.env.BOT_ENGINE_PORT || 4010),
  dbHost: process.env.DB_HOST || '127.0.0.1',
  dbPort: Number(process.env.DB_PORT || 3306),
  dbUser: process.env.DB_USER || 'root',
  dbPassword: process.env.DB_PASSWORD || 'root',
  dbName: process.env.DB_NAME || 'apps_premhytam',
  apiUrl: process.env.VITE_API_BASE_URL || `http://localhost:${Number(process.env.PORT || 4000)}/api`,
  botEngineUrl: process.env.BOT_ENGINE_URL || `http://localhost:${Number(process.env.BOT_ENGINE_PORT || 4010)}`,
};

function checkTcp(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok, message = '') => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ ok, message });
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false, 'timeout'));
    socket.on('error', (error) => done(false, error.message));
  });
}

function checkHttp(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, statusCode: response.statusCode });
    });
    request.on('timeout', () => {
      request.destroy();
      resolve({ ok: false, message: 'timeout' });
    });
    request.on('error', (error) => resolve({ ok: false, message: error.message }));
  });
}

async function checkDb() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: config.dbHost,
      port: config.dbPort,
      user: config.dbUser,
      password: config.dbPassword,
      database: config.dbName,
      connectTimeout: 5000,
    });
    await connection.query('SELECT 1');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  } finally {
    await connection?.end().catch(() => {});
  }
}

function print(name, result, detail = '') {
  const icon = result.ok ? 'OK ' : 'ERR';
  console.log(`${icon} ${name}${detail ? ` - ${detail}` : ''}${result.message ? ` (${result.message})` : ''}`);
}

const checks = [];

console.log('Premiumin Plus Doctor');
console.log(`Ports: frontend=${config.frontendPort}, backend=${config.backendPort}, bot=${config.botPort}, mysql=${config.dbPort}`);
console.log(`API URL: ${config.apiUrl}`);
console.log(`Bot Engine URL: ${config.botEngineUrl}`);

checks.push(['frontend tcp', await checkTcp('127.0.0.1', config.frontendPort), `127.0.0.1:${config.frontendPort}`]);
checks.push(['backend tcp', await checkTcp('127.0.0.1', config.backendPort), `127.0.0.1:${config.backendPort}`]);
checks.push(['bot-engine tcp', await checkTcp('127.0.0.1', config.botPort), `127.0.0.1:${config.botPort}`]);
checks.push(['mysql tcp', await checkTcp(config.dbHost, config.dbPort), `${config.dbHost}:${config.dbPort}`]);
checks.push(['backend health', await checkHttp(`http://127.0.0.1:${config.backendPort}/health`)]);
checks.push(['bot-engine health', await checkHttp(`http://127.0.0.1:${config.botPort}/health`)]);
checks.push(['database login', await checkDb(), `${config.dbUser}@${config.dbHost}/${config.dbName}`]);

let failed = 0;
for (const [name, result, detail] of checks) {
  print(name, result, detail);
  if (!result.ok) failed += 1;
}

if (failed) {
  console.error(`Doctor failed: ${failed} check(s) need attention.`);
  process.exit(1);
}

console.log('Doctor passed: stack ports, health endpoints, and database are reachable.');
