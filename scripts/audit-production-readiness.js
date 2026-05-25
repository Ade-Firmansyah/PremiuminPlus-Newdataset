import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['backend/src', 'bot-engine', 'frontend/src', 'shared'];
const ignore = new Set(['backend/src/config/db.js', 'backend/src/config/validate-env.js']);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile() && /\.(js|ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function findMatches(pattern) {
  const matches = [];
  for (const rootDir of scanRoots) {
    const absolute = path.join(root, rootDir);
    if (!fs.existsSync(absolute)) continue;
    for (const file of walk(absolute)) {
      const relative = rel(file);
      if (ignore.has(relative)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (pattern.test(line)) matches.push({ file: relative, line: index + 1, text: line.trim() });
      });
    }
  }
  return matches;
}

const sqlMatches = findMatches(/config\/db\.js|config\\db\.js|from ['"].*\/db\.js['"]|import\(['"].*\/db\.js['"]\)/);
const qrPersistenceMatches = findMatches(/qr_image|qr_raw|qr_data/).filter((item) => !item.file.includes('payment.service.js') && !item.file.includes('deposit.service.js'));
const aggressivePollingMatches = findMatches(/setInterval\(|setTimeout\(/).filter((item) => !/heartbeat|cleanup|maintenance|payment|idle|clock/i.test(item.text));

const sections = [
  {
    title: 'SQL legacy imports',
    severity: sqlMatches.length ? 'BLOCKER' : 'OK',
    matches: sqlMatches,
    message: 'MongoDB Atlas cannot be claimed as single source of truth while core code imports config/db.js.',
  },
  {
    title: 'QR persistence references',
    severity: qrPersistenceMatches.length ? 'REVIEW' : 'OK',
    matches: qrPersistenceMatches,
    message: 'QR fields are allowed only as temporary payment/deposit transport and must be cleared after close.',
  },
  {
    title: 'Potential polling/timers',
    severity: aggressivePollingMatches.length ? 'REVIEW' : 'OK',
    matches: aggressivePollingMatches,
    message: 'Timers must be bounded heartbeat, cleanup, idle, or payment lifecycle checks.',
  },
];

let hasBlocker = false;
for (const section of sections) {
  console.log(`\n[${section.severity}] ${section.title}`);
  console.log(section.message);
  for (const match of section.matches.slice(0, 80)) {
    console.log(`- ${match.file}:${match.line} ${match.text}`);
  }
  if (section.matches.length > 80) {
    console.log(`- ... ${section.matches.length - 80} more`);
  }
  if (section.severity === 'BLOCKER') hasBlocker = true;
}

if (hasBlocker) {
  console.error('\nProduction readiness audit failed. Resolve BLOCKER items before MongoDB SSOT deploy.');
  process.exit(1);
}

console.log('\nProduction readiness audit passed.');
