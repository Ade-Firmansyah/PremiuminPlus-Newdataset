import { FileText } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from './dashboardPageKit';

const docsList = [
  { title: 'API Key User', desc: 'Member dan reseller bisa memakai x-api-key atau Authorization Bearer untuk /me, /products, order, deposit, withdraw, riwayat, dan mutasi.' },
  { title: 'Order API', desc: 'POST /api/order memakai saldo usable. POST /api/payments/direct-order membuat QRIS dan order diproses setelah pembayaran sukses.' },
  { title: 'Bot Reseller', desc: 'Endpoint /api/bot/* hanya untuk reseller/admin dengan akses bot aktif. Semua saldo, profit, dan order tetap diproses backend.' },
  { title: 'Dokumen Lengkap', desc: 'Buka menu API Key untuk contoh curl, payload JSON, status code, base URL production, dan aturan keamanan API key.' },
  { title: 'Webhook', desc: 'Callback Premku diterima backend, disimpan ke webhook_logs, lalu status DB diperbarui.' },
  { title: 'Status API', desc: 'Response sukses memakai status true dan data. Error memakai status false dan message dengan HTTP code yang sesuai.' },
];

export default function Dokumen() {
  return (
    <div className="dokumen">
      <PageHero
        title="Dokumen"
        subtitle="Dokumen disajikan seperti catatan singkat yang bersih dan praktis."
        slogan="Cepat dibaca, mudah ditemukan, dan tetap terasa premium."
        tone="from-slate-500/15 via-cyan-500/10 to-brand/10"
        chips={['Panduan', 'Webhook', 'API ringkas']}
      />
      <div className="mt-4">
      <PageSection title="Dokumentasi" subtitle="Dokumentasi ringkas">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {docsList.map((item) => (
            <NeonCard key={item.title}>
              <div className="flex items-center gap-2 text-brand">
                <FileText className="h-4 w-4" />
                <p className="text-sm font-semibold text-white">{item.title}</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/45">{item.desc}</p>
            </NeonCard>
          ))}
        </div>
      </PageSection>
      </div>
    </div>
  );
}
