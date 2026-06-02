import { AlertTriangle, LifeBuoy, MessageCircleQuestion, ShieldAlert } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from './dashboardPageKit';

const supportTopics = [
  'Login gagal',
  'Order pending',
  'Saldo belum masuk',
  'Produk tidak aktif',
  'Butuh penjelasan admin',
];

const reportSteps = [
  'Tulis judul singkat dan spesifik.',
  'Jelaskan kronologi singkat, bukan hanya gejala.',
  'Sertakan nominal, waktu, atau ID transaksi jika ada.',
  'Tambahkan kontak yang bisa dihubungi kembali.',
];

export default function LaporanKendala() {
  return (
    <div className="laporan-kendala">
      <PageHero
        title="Laporan Kendala"
        subtitle="Laporan dibikin seperti form support yang bersih, pendek, dan jelas."
        slogan="Ceritakan masalah dengan rapi, tim lebih cepat menelusuri."
        tone="from-rose-500/15 via-amber-500/10 to-sky-500/10"
        chips={['Support form', 'Cepat dibaca', 'Detail lengkap']}
      />
      <div className="mt-4">
      <PageSection title="Form bantuan" subtitle="Form bantuan dan pelaporan">
        <div className="mb-4 rounded-[1.4rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,0,127,0.12),rgba(14,165,233,0.10))] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">Dasar laporan</p>
          <h3 className="mt-2 text-2xl font-extrabold text-white">Biar cepat dibaca, cepat diproses, dan cepat selesai.</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">
            Gunakan halaman ini untuk menyampaikan kendala dengan format yang rapi. Semakin jelas isinya, semakin mudah tim menelusuri masalah dan memberi jawaban yang tepat.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
          <NeonCard>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/20">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Form laporan</p>
                <p className="mt-1 text-xs text-white/45">Isikan data dasar lalu kirim ke tim support.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              <input className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="Judul kendala, misal: deposit belum masuk" />
              <div className="grid gap-3 md:grid-cols-2">
                <select className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand/50">
                  <option>Kategori masalah</option>
                  <option>Login</option>
                  <option>Order</option>
                  <option>Deposit</option>
                  <option>Produk</option>
                </select>
                <select className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand/50">
                  <option>Prioritas</option>
                  <option>Rendah</option>
                  <option>Sedang</option>
                  <option>Tinggi</option>
                </select>
              </div>
              <textarea
                className="min-h-40 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-brand/50"
                placeholder="Ceritakan kendala dari awal. Contoh: saya deposit pukul 09.15, nominal 50.000, tetapi saldo belum masuk setelah 10 menit."
              />
              <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                <input className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="No. WhatsApp atau email" />
                <button className="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/20">Kirim Laporan</button>
              </div>
            </div>
          </NeonCard>

          <div className="space-y-4">
            <NeonCard>
              <div className="flex items-center gap-3">
                <LifeBuoy className="h-5 w-5 text-emerald-300" />
                <p className="text-sm font-semibold text-white">Panduan singkat</p>
              </div>
              <div className="mt-4 space-y-3">
                {reportSteps.map((item, index) => (
                  <div key={item} className="grid grid-cols-[30px_1fr] gap-3">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-brand/10 text-xs font-black text-brand">{index + 1}</span>
                    <p className="text-sm leading-6 text-white/65">{item}</p>
                  </div>
                ))}
              </div>
            </NeonCard>

            <NeonCard>
              <div className="flex items-center gap-3">
                <MessageCircleQuestion className="h-5 w-5 text-sky-300" />
                <p className="text-sm font-semibold text-white">Topik cepat</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {supportTopics.map((topic) => (
                  <span key={topic} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                    {topic}
                  </span>
                ))}
              </div>
            </NeonCard>

          <div className="rounded-[1.4rem] border border-amber-500/20 bg-amber-500/10 p-4 text-amber-100">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                <p className="text-sm leading-6">
                  Semakin lengkap detail yang kamu kirim, semakin cepat tim bisa cek. Sertakan bukti bila kasusnya berkaitan dengan deposit atau order.
                </p>
              </div>
            </div>
          </div>
        </div>
      </PageSection>
      </div>
    </div>
  );
}
