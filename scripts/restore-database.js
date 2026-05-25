import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI || '';
const dbName = process.env.MONGODB_DBNAME || process.env.MONGO_DBNAME || 'premiuminpluus';
const input = process.argv[2] || process.env.RESTORE_DIR || '';

if (!uri) {
  console.error('MONGODB_URI is required for MongoDB restore.');
  process.exit(1);
}

if (!input) {
  console.error('Usage: node scripts/restore-database.js <backup-directory>');
  process.exit(1);
}

const resolved = path.resolve(input);
if (!fs.existsSync(resolved)) {
  console.error(`Backup directory not found: ${resolved}`);
  process.exit(1);
}

const dbDumpDir = fs.existsSync(path.join(resolved, dbName)) ? path.join(resolved, dbName) : resolved;
const args = ['--uri', uri, '--db', dbName, '--drop', dbDumpDir];
console.log(`Running mongorestore for ${dbName} <- ${dbDumpDir}`);

const child = spawn('mongorestore', args, { stdio: 'inherit', shell: process.platform === 'win32' });
child.on('error', (error) => {
  console.error(`Failed to start mongorestore: ${error.message}`);
  console.error('Install MongoDB Database Tools first: https://www.mongodb.com/try/download/database-tools');
  process.exit(1);
});
child.on('exit', (code) => {
  if (code === 0) {
    console.log('Restore completed.');
    return;
  }
  console.error(`mongorestore failed with exit code ${code}`);
  process.exit(code || 1);
});
