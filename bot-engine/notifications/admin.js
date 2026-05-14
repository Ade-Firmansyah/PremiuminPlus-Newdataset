import { config } from '../config.js';

export async function notifyAdmin(sock, lines) {
  if (!sock || !config.adminMonitorJid) return;
  await sock.sendMessage(config.adminMonitorJid, { text: Array.isArray(lines) ? lines.join('\n') : String(lines) }).catch(() => {});
}
