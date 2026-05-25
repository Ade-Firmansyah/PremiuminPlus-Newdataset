import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const dbName = process.env.MONGODB_DBNAME || process.env.MONGO_DBNAME || 'premiuminpluus';
const backupRoot = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');

if (!uri) {
  console.error('MONGODB_URI is required for MongoDB backup.');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(backupRoot, `mongo-${dbName}-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const args = ['--uri', uri, '--db', dbName, '--out', outDir];
console.log(`Running mongodump for ${dbName} -> ${outDir}`);

const child = spawn('mongodump', args, { stdio: 'inherit', shell: process.platform === 'win32' });
child.on('error', (error) => {
  console.error(`Failed to start mongodump: ${error.message}`);
  console.error('Install MongoDB Database Tools first: https://www.mongodb.com/try/download/database-tools');
  process.exit(1);
});
child.on('exit', (code) => {
  if (code === 0) {
    console.log(`Backup completed: ${outDir}`);
    return;
  }
  console.error(`mongodump failed with exit code ${code}`);
  process.exit(code || 1);
});
