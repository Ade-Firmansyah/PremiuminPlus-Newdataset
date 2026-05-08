import app from './src/app.js';
import env from './src/config/env.js';
import { ensureInitialized } from './src/config/db.js';

await ensureInitialized();

const server = app.listen(env.PORT, () => {
  console.log(`Premiumin Plus backend running on port ${env.PORT}`);
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`[SYSTEM] Backend port ${env.PORT} sudah dipakai. Backend lama kemungkinan masih berjalan.`);
    console.error(`[SYSTEM] Cek dengan: Get-NetTCPConnection -LocalPort ${env.PORT} -State Listen`);
    console.error('[SYSTEM] Jika ingin restart, hentikan proses node lama lalu jalankan npm run backend lagi.');
    process.exit(1);
  }

  throw error;
});
