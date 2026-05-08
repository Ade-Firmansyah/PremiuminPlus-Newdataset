import { FileText } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from './dashboardPageKit';

const docsList = [
  { title: 'API Docs', desc: 'Gunakan x-api-key user reseller untuk mengakses endpoint backend Premiumin Plus.' },
  { title: 'Webhook', desc: 'Callback Premku diterima backend, disimpan ke webhook_logs, lalu status DB diperbarui.' },
  { title: 'Status API', desc: 'Daftar status sukses, pending, dan gagal.' },
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
        <div className="grid gap-4 md:grid-cols-3">
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
