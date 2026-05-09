import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Banknote,
  BarChart3,
  BookText,
  Bot,
  ClipboardList,
  Coins,
  Code2,
  ArrowRight,
  AlertTriangle,
  HelpCircle,
  Layers3,
  MessageCircle,
  Phone,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Send,
  Users,
  Wallet,
} from 'lucide-react';
import { motion } from 'motion/react';
import { AppShell, type NavSection } from '../components/layout/AppShell';
import { ApiKeyCard } from '../components/ApiKeyCard';
import { premiuminApi, type DashboardSummaryRecord, type DepositRecord, type OrderRecord, type ProductRecord, type TopAccountRecord } from '../services/api';
import { getApiKey } from '../store/useAuth';
import { formatCurrency, formatNumber, getGreeting } from '../utils/format';
import cardArt from '../asset/logo-upscale.png';
import BotWA from './botwa';
import DaftarHarga from './daftarharga';
import Dokumen from './dokumen';
import LaporanKendala from './laporankendala';
import MutasiSaldo from './mutasisaldo';
import Order from './order';
import Profil from './profil';
import RiwayatPesanan from './riwayatpesanan';
import TarikSaldo from './tariksaldo';

// Dashboard utama dibangun sebagai panel premium dengan hero, kartu saldo, statistik, dan menu halaman turunan.
interface DashboardPageProps {
  session: {
    username: string;
    role: string;
    apiKey: string;
  };
  onLogout: () => void;
}

const sections: NavSection[] = [
  {
    label: 'Utama',
    items: [
      { label: 'Dasbor', to: '/dashboard', icon: Layers3, end: true },
      { label: 'Komunitas WA', to: '/dashboard/komunitas-wa', icon: MessageCircle },
    ],
  },
  {
    label: 'Transaksi',
    items: [
      { label: 'Order Akun', to: '/dashboard/order-akun', icon: ShoppingBag },
      { label: 'Deposit Saldo', to: '/dashboard/deposit-saldo', icon: Wallet },
      { label: 'Daftar Harga', to: '/dashboard/daftar-harga', icon: ReceiptText },
      { label: 'Tarik Saldo', to: '/dashboard/tarik-saldo', icon: Banknote },
      { label: 'Riwayat Pesanan', to: '/dashboard/riwayat-pesanan', icon: ClipboardList },
      { label: 'Mutasi Saldo', to: '/dashboard/mutasi-saldo', icon: Coins },
    ],
  },
  {
    label: 'Akun',
    items: [
      { label: 'Profil', to: '/dashboard/profil', icon: Users },
      { label: 'Laporan Kendala', to: '/dashboard/laporan-kendala', icon: ShieldCheck },
      { label: 'Bot Wa Setting', to: '/dashboard/bot-wa-telegram', icon: Bot },
      { label: 'Dokumen', to: '/dashboard/dokumen', icon: BookText },
    ],
  },
];

const quickDeposits = [10000, 25000, 50000, 100000, 250000, 500000];
const pageTitles: Record<string, string> = {
  '/dashboard/komunitas-wa': 'Komunitas WA',
  '/dashboard/order-akun': 'Order Akun',
  '/dashboard/deposit-saldo': 'Deposit Saldo',
  '/dashboard/daftar-harga': 'Daftar Harga',
  '/dashboard/tarik-saldo': 'Tarik Saldo',
  '/dashboard/riwayat-pesanan': 'Riwayat Pesanan',
  '/dashboard/riwayat-deposit': 'Mutasi Saldo',
  '/dashboard/mutasi-saldo': 'Mutasi Saldo',
  '/dashboard/profil': 'Profil',
  '/dashboard/laporan-kendala': 'Laporan Kendala',
  '/dashboard/bot-wa-telegram': 'Bot Wa Setting',
  '/dashboard/dokumen': 'Dokumen',
  '/dashboard/document': 'Document',
};

function Sparkline({ points }: { points: number[] }) {
  const safePoints = points.length > 1 ? points : [0, points[0] || 0];
  const width = 180;
  const height = 48;
  const max = Math.max(...safePoints);
  const min = Math.min(...safePoints);
  const range = Math.max(max - min, 1);
  const step = width / (safePoints.length - 1);
  const path = safePoints
    .map((point, index) => {
      const x = index * step;
      const y = height - ((point - min) / range) * (height - 6) - 3;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-full">
      <path d={path} fill="none" stroke="rgba(255,0,127,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SectionShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4 shadow-[0_0_24px_rgba(255,0,127,0.05)] lg:p-5"
    >
      <div className="mb-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-white/35">{subtitle}</p>
        <h2 className="mt-2 text-xl font-extrabold tracking-tight text-white lg:text-[1.7rem]">{title}</h2>
      </div>
      {children}
    </motion.section>
  );
}

function LinkCard({
  title,
  description,
  href,
  icon: Icon,
  tone,
}: {
  title: string;
  description: string;
  href: string;
  icon: typeof MessageCircle;
  tone: string;
}) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className={`rounded-[1.35rem] border border-white/10 bg-[#0f0b15] p-5 transition-shadow duration-200 hover:shadow-lg ${tone}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/20">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{title}</h3>
            <p className="mt-1 text-sm text-white/45">{description}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 text-sm font-semibold text-brand">Buka link</div>
    </motion.a>
  );
}

function ChannelCard({
  title,
  tagline,
  description,
  href,
  icon: Icon,
  tone,
  bullets,
}: {
  title: string;
  tagline: string;
  description: string;
  href: string;
  icon: typeof MessageCircle;
  tone: string;
  bullets: string[];
}) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className={`overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#0f0b15] ${tone}`}
    >
      <div className="p-4 lg:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/10">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-white/45">{tagline}</p>
              <h3 className="mt-1 text-[15px] font-extrabold text-white lg:text-lg">{title}</h3>
          </div>
          </div>
          <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-white/80">
            Live
          </span>
        </div>

        <p className="mt-4 max-w-md text-sm leading-6 text-white/75">{description}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {bullets.map((bullet) => (
            <span key={bullet} className="rounded-full border border-white/10 bg-black/10 px-3 py-1.5 text-[11px] text-white/80">
              {bullet}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-sm font-semibold text-white lg:px-5">
        <span className="text-white/70">{title}</span>
        <span className="text-white">Buka channel</span>
      </div>
    </motion.a>
  );
}

function MenuPage({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <SectionShell title={title} subtitle={subtitle}>
        {children}
      </SectionShell>
    </motion.div>
  );
}

function DepositTopup() {
  const [amount, setAmount] = useState(25000);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState('');
  const [depositResult, setDepositResult] = useState<DepositRecord | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [adminWhatsapp, setAdminWhatsapp] = useState('');
  const apiKey = getApiKey();
  const waDepositLink = adminWhatsapp
    ? `https://wa.me/${adminWhatsapp}?text=Halo%20Admin%2C%20saya%20ingin%20top%20up%20saldo.`
    : '';

  const qrImage = depositResult?.qr_image || depositResult?.qr_data || '';
  const qrSrc = qrImage
    ? qrImage.startsWith('data:image')
      ? qrImage
      : `data:image/png;base64,${qrImage}`
    : '';
  const modalOpen = Boolean(depositResult && !['success', 'canceled', 'failed', 'expired'].includes(String(depositResult.status || 'pending')));

  useEffect(() => {
    let active = true;
    premiuminApi.publicConfig()
      .then((response) => {
        if (active) setAdminWhatsapp(response.data.admin_whatsapp || '');
      })
      .catch(() => {
        if (active) setAdminWhatsapp('');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!depositResult?.expired_at || !modalOpen) return;
    const updateCountdown = () => {
      const next = Math.max(0, Math.floor((new Date(depositResult.expired_at || '').getTime() - Date.now()) / 1000));
      setSecondsLeft(next);
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [depositResult?.expired_at, modalOpen]);

  useEffect(() => {
    if (!depositResult?.invoice || !modalOpen) return;

    let active = true;
    const timer = window.setInterval(async () => {
      if (!active) return;
      try {
        const response = await premiuminApi.depositStatus(depositResult.invoice, apiKey || undefined);
        if (!active) return;
        setDepositResult(response.data);
        if (response.data.status === 'success') {
          window.dispatchEvent(new Event('premiuminplus:balance-updated'));
          active = false;
          window.clearInterval(timer);
        }
      } catch {
        // Manual check will surface errors; polling stays quiet to keep the modal calm.
      }
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [depositResult?.invoice, modalOpen, apiKey]);

  const formatCountdown = (value: number) => {
    const minutes = Math.floor(value / 60).toString().padStart(2, '0');
    const seconds = Math.floor(value % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const submitDeposit = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    setDepositResult(null);

    try {
      const response = await premiuminApi.deposit({ amount }, apiKey || undefined);
      setDepositResult(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal membuat deposit.');
    } finally {
      setLoading(false);
    }
  };

  const checkDeposit = async () => {
    if (!depositResult?.invoice || checking) return;
    setChecking(true);
    setError('');
    try {
      const response = await premiuminApi.depositStatus(depositResult.invoice, apiKey || undefined);
      setDepositResult(response.data);
      if (response.data.status === 'success') {
        window.dispatchEvent(new Event('premiuminplus:balance-updated'));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal cek status deposit.');
    } finally {
      setChecking(false);
    }
  };

  const cancelDeposit = async () => {
    if (!depositResult?.invoice || canceling) return;
    setCanceling(true);
    setError('');
    try {
      const response = await premiuminApi.depositCancel(depositResult.invoice, apiKey || undefined);
      setDepositResult(response.data);
      window.setTimeout(() => setDepositResult(null), 650);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal membatalkan deposit.');
    } finally {
      setCanceling(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-4 xl:max-h-[calc(100vh-112px)] xl:overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white">
            Isi Saldo <span className="text-brand">Otomatis</span>
          </h2>
          <p className="mt-1 text-xs text-white/55">Top up saldo instan 24 jam via QRIS, e-wallet, dan mobile banking.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-light">
          <Sparkles className="h-3.5 w-3.5" />
          QRIS Payment
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.04fr_0.96fr]">
        <section className="rounded-[1.25rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,0,127,0.04))] p-5 shadow-[0_14px_32px_rgba(0,0,0,0.18)]">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">Nominal Deposit</span>
            <div className="mt-3 flex items-center rounded-xl border border-white/10 bg-[#0b0f1a] px-4 py-4">
              <span className="text-2xl font-black text-white/70">Rp</span>
              <input
                value={amount.toLocaleString('id-ID')}
                onChange={(event) => {
                  const numeric = Number(event.target.value.replace(/\D/g, '')) || 0;
                  setAmount(Math.min(numeric, 1000000));
                }}
                className="ml-2 w-full bg-transparent text-3xl font-black text-white outline-none"
                inputMode="numeric"
                aria-label="Nominal deposit"
              />
            </div>
          </label>

          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-white/55">
            <span className="inline-flex items-center gap-2">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">i</span>
              Minimal Rp1.000
            </span>
            <span>Maks Rp1.000.000</span>
          </div>

          <div className="mt-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">Pilihan Cepat</p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {quickDeposits.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmount(value)}
                  className={`rounded-xl border px-3 py-4 text-center transition ${
                    amount === value
                      ? 'border-brand bg-brand/10 text-brand shadow-[0_0_24px_rgba(255,0,127,0.14)]'
                      : 'border-white/10 bg-[#0b0f1a]/70 text-white hover:border-white/20'
                  }`}
                >
                  <span className="block text-xs text-white/50">+ Rp</span>
                  <strong className="mt-1 block text-lg">{formatNumber(value)}</strong>
                </button>
              ))}
            </div>
          </div>

          {error ? <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
          {depositResult?.status === 'success' ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              Deposit {depositResult.invoice} sukses. Saldo dashboard diperbarui otomatis.
            </div>
          ) : null}

          <button
            type="button"
            onClick={submitDeposit}
            disabled={loading}
            className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-xl bg-brand px-5 py-3.5 text-xs font-extrabold uppercase tracking-[0.16em] text-white shadow-lg shadow-brand/20 transition hover:scale-[1.01] disabled:opacity-60"
          >
            {loading ? 'Membuat pembayaran...' : 'Lanjut Pembayaran'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>

        <section className="rounded-[1.25rem] border border-white/10 bg-white/5 p-5 shadow-[0_14px_32px_rgba(0,0,0,0.18)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20">
              <HelpCircle className="h-5 w-5" />
            </div>
            <h3 className="text-xl font-extrabold text-white">Cara Pembayaran</h3>
          </div>

          <div className="mt-6 space-y-5">
            {[
              'Sistem akan men-generate QRIS dinamis. Anda bebas scan menggunakan DANA, GoPay, OVO, ShopeePay, atau mobile banking.',
              'Pastikan nominal transfer SAMA PERSIS hingga 3 digit terakhir. Jika tidak sesuai, saldo tidak masuk otomatis.',
              'Saldo bertambah otomatis ke akun Anda dalam waktu 1 - 5 menit setelah pembayaran berhasil divalidasi.',
            ].map((text, index) => (
              <div key={text} className="grid grid-cols-[34px_1fr] gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand/20 text-sm font-black text-brand-light">{index + 1}</span>
                <p className="text-sm leading-6 text-white/70">{text}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-200">
            <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-amber-300" />
            <p>Jika saldo belum masuk lebih dari 10 menit, segera hubungi admin via WhatsApp dengan menyertakan bukti transfer.</p>
          </div>
        </section>
      </div>

      <section className="rounded-[1.25rem] border border-brand/25 bg-[linear-gradient(145deg,rgba(255,0,127,0.12),rgba(255,255,255,0.035))] p-4">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
              <Phone className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white">Butuh Bantuan?</h3>
              <p className="mt-1 max-w-lg text-xs leading-5 text-white/55">Konsultasikan kebutuhanmu langsung ke tim kami via WhatsApp.</p>
            </div>
          </div>
          <a
            href={waDepositLink}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex min-w-[220px] items-center justify-center gap-2.5 rounded-xl px-5 py-3 text-sm font-extrabold text-white shadow-lg transition hover:scale-[1.01] ${
              waDepositLink ? 'bg-emerald-500 shadow-emerald-500/20' : 'pointer-events-none bg-white/10 opacity-50'
            }`}
          >
            <MessageCircle className="h-5 w-5" />
            Chat WhatsApp
          </a>
        </div>
      </section>

      {depositResult ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-md overflow-hidden rounded-[1.5rem] border border-brand/25 bg-[#0f172a] shadow-[0_0_48px_rgba(255,46,136,0.22)]"
          >
            <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(255,46,136,0.18),rgba(17,24,39,0.96))] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-light">QRIS Deposit</p>
                  <h3 className="mt-1 text-xl font-black text-white">{depositResult.invoice}</h3>
                </div>
                <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
                  {depositResult.status || 'pending'}
                </span>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="mx-auto grid aspect-square max-w-[260px] place-items-center rounded-[1.25rem] border border-brand/25 bg-white p-4 shadow-[0_0_30px_rgba(255,46,136,0.18)]">
                {qrSrc ? <img src={qrSrc} alt={`QRIS ${depositResult.invoice}`} className="h-full w-full object-contain" /> : <p className="text-center text-sm font-bold text-slate-900">QR belum tersedia</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Total bayar</p>
                  <p className="mt-1 text-lg font-black text-white">{formatCurrency(depositResult.total_bayar || depositResult.amount)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Expired</p>
                  <p className="mt-1 text-lg font-black text-brand-light">{formatCountdown(secondsLeft)}</p>
                </div>
              </div>

              {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

              {depositResult.status === 'success' ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  Pembayaran sukses. Saldo kamu sudah disinkronkan.
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={checkDeposit}
                  disabled={checking || depositResult.status === 'success'}
                  className="rounded-2xl bg-brand px-4 py-3 text-sm font-black text-white shadow-lg shadow-brand/20 disabled:opacity-60"
                >
                  {checking ? 'Checking...' : 'Check Deposit'}
                </button>
                <button
                  type="button"
                  onClick={cancelDeposit}
                  disabled={canceling || depositResult.status === 'success'}
                  className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm font-black text-rose-100 disabled:opacity-60"
                >
                  {canceling ? 'Canceling...' : 'Cancel Deposit'}
                </button>
              </div>

              {['success', 'canceled', 'failed', 'expired'].includes(String(depositResult.status)) ? (
                <button
                  type="button"
                  onClick={() => setDepositResult(null)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/75"
                >
                  Tutup
                </button>
              ) : null}
            </div>
          </motion.div>
        </div>
      ) : null}
    </motion.div>
  );
}

export function DashboardPage({ session, onLogout }: DashboardPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [saldo, setSaldo] = useState(0);
  const [summary, setSummary] = useState<DashboardSummaryRecord | null>(null);
  const [dashboardProducts, setDashboardProducts] = useState<ProductRecord[]>([]);
  const [recentOrderRows, setRecentOrderRows] = useState<OrderRecord[]>([]);
  const [topAccounts, setTopAccounts] = useState<TopAccountRecord[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [saldoError, setSaldoError] = useState('');
  const path = location.pathname.replace(/\/+$/, '') || '/dashboard';
  const accountLabel = session.role === 'admin' ? 'Admin' : session.role === 'reseller' ? 'Reseller' : 'Member';
  const greeting = getGreeting();
  const visibleSections = sections
    .map((navSection) => ({
      ...navSection,
      items: navSection.items.filter((item) => {
        if (session.role !== 'member') return true;
        return ['Dasbor', 'Order Akun', 'Deposit Saldo', 'Daftar Harga', 'Riwayat Pesanan', 'Mutasi Saldo', 'Profil', 'Bot Wa Setting'].includes(item.label);
      }),
    }))
    .filter((navSection) => navSection.items.length);

  const section = path === '/dashboard' ? null : path;
  const memberAllowedPaths = new Set(['/dashboard', '/dashboard/order-akun', '/dashboard/deposit-saldo', '/dashboard/daftar-harga', '/dashboard/riwayat-pesanan', '/dashboard/riwayat-deposit', '/dashboard/mutasi-saldo', '/dashboard/profil', '/dashboard/bot-wa-telegram']);

  useEffect(() => {
    if (session.role === 'member' && !memberAllowedPaths.has(path)) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate, path, session.role]);

  useEffect(() => {
    const loadDashboardData = async () => {
      setDashboardLoading(true);
      try {
        const [meResponse, summaryResponse, productResponse, orderResponse, leaderboardResponse] = await Promise.all([
          premiuminApi.me(session.apiKey),
          premiuminApi.dashboardSummary(session.apiKey),
          premiuminApi.products(session.apiKey),
          premiuminApi.transactions(session.apiKey),
          premiuminApi.topAccounts(session.apiKey).catch(() => ({ status: false, data: [] as TopAccountRecord[] })),
        ]);
        const resolvedTopAccounts = summaryResponse.data.top_accounts?.length ? summaryResponse.data.top_accounts : leaderboardResponse.data;
        setSaldo(meResponse.data.saldo);
        setSummary({ ...summaryResponse.data, top_accounts: resolvedTopAccounts });
        setDashboardProducts(productResponse.data);
        setRecentOrderRows(orderResponse.data.slice(0, 3));
        setTopAccounts(resolvedTopAccounts);
        setSaldoError('');
      } catch (caught) {
        setSaldoError(caught instanceof Error ? caught.message : 'Gagal memuat saldo.');
      } finally {
        setDashboardLoading(false);
      }
    };

    void loadDashboardData();
    const timer = window.setInterval(() => void loadDashboardData(), 30000);

    const handleBalanceRefresh = () => {
      void loadDashboardData();
    };
    window.addEventListener('premiuminplus:balance-updated', handleBalanceRefresh);
    window.addEventListener('premiuminplus:orders-updated', handleBalanceRefresh);

    return () => {
      window.removeEventListener('premiuminplus:balance-updated', handleBalanceRefresh);
      window.removeEventListener('premiuminplus:orders-updated', handleBalanceRefresh);
      window.clearInterval(timer);
    };
  }, [session.apiKey]);

  const productStockLine = dashboardProducts.slice(0, 10).map((product) => Number(product.stock || 0)).reverse();

  const dashboardStats = [
    {
      label: 'Total Deposit',
      value: summary?.total_deposit_amount || 0,
      icon: Coins,
      tone: 'emerald' as const,
      suffix: '',
      line: summary?.charts?.deposits || [0, 0],
    },
    {
      label: 'Total Belanja',
      value: summary?.total_spent || 0,
      icon: ShoppingCart,
      tone: 'pink' as const,
      suffix: '',
      line: summary?.charts?.spending || [0, 0],
    },
    {
      label: 'Total Pesanan',
      value: summary?.total_transactions || 0,
      icon: ClipboardList,
      tone: 'blue' as const,
      suffix: 'Trx',
      line: summary?.charts?.orders || [0, 0],
    },
    {
      label: 'Produk Aktif',
      value: summary?.active_products || dashboardProducts.length,
      icon: BarChart3,
      tone: 'amber' as const,
      suffix: 'Layanan',
      line: summary?.charts?.products || productStockLine,
    },
  ];

  const sectionContent: Record<string, ReactNode> = {
    '/dashboard/komunitas-wa': (
      <MenuPage title="Komunitas WA" subtitle="Hubungi admin, developer, dan komunitas resmi">
        <div className="mb-4 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(16,185,129,0.14),rgba(2,132,199,0.12))] p-4 lg:p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-white/45">Slogan Komunitas</p>
            <h3 className="mt-2 text-[1.35rem] font-extrabold text-white lg:text-2xl">Cuan digital tumbuh bareng, bukan jalan sendirian.</h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
              Bergabung bersama reseller, anggota, admin, dan developer untuk diskusi, masukan, update stok, serta strategi jualan digital yang lebih rapi.
              Admin biasanya lebih cepat merespons lewat WhatsApp, sedangkan developer lebih aktif di grup Telegram.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Jual konsisten', 'Bangun reputasi', 'Belajar bareng', 'Cuan tertata'].map((item) => (
                <span key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/70">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[1.35rem] border border-white/10 bg-[#0f0b15] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-emerald-300">WhatsApp</p>
              <p className="mt-2 text-sm text-white/65">Jalur cepat untuk hubungi admin, tanya stok, dan koordinasi reseller harian.</p>
            </div>
            <div className="rounded-[1.35rem] border border-white/10 bg-[#0f0b15] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-sky-300">Telegram</p>
              <p className="mt-2 text-sm text-white/65">Tempat developer lebih aktif, diskusi teknis, arsip update, dan masukan fitur.</p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ChannelCard
            title="Grup Reseller WhatsApp"
            tagline="Hijau / admin / responsif"
            description="Masuk untuk ngobrol bareng admin, reseller, dan anggota. Cocok untuk support cepat, info stok, dan koordinasi jualan."
            href="https://chat.whatsapp.com/Igg1KjY54I3A2ERIgofm4b"
            icon={MessageCircle}
            tone="bg-[linear-gradient(145deg,rgba(34,197,94,0.20),rgba(15,11,21,0.98))]"
            bullets={['Admin response', 'Diskusi jualan', 'Update stok']}
          />
          <ChannelCard
            title="Channel Telegram"
            tagline="Biru / developer / rapi"
            description="Gabung untuk update developer, diskusi fitur, arsip pengumuman, dan masukan sistem agar panel makin nyaman dipakai."
            href="https://t.me/+1tkWNfTUfEg1MTY1"
            icon={Send}
            tone="bg-[linear-gradient(145deg,rgba(14,165,233,0.20),rgba(15,11,21,0.98))]"
            bullets={['Developer aktif', 'Masukan fitur', 'Arsip update']}
          />
        </div>
        <div className="mt-4 rounded-[1.35rem] border border-amber-500/20 bg-amber-500/10 p-4 lg:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-amber-200/80">Prosedur Grup</p>
              <h3 className="mt-2 text-xl font-extrabold text-white">Rame boleh, saling jaga wajib.</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
                Dilarang mengirim konten dewasa, spam iklan produk luar, menculik member, atau mengajak transaksi di luar aturan grup.
                Pelanggaran akan diban dan tidak diperbolehkan kontribusi kembali. Terima kasih sudah mematuhi prosedur yang ada.
              </p>
            </div>
            <div className="grid gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/65 sm:grid-cols-3 lg:min-w-[360px]">
              <span className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">Etika jualan</span>
              <span className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">Anti spam</span>
              <span className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">Aman bareng</span>
            </div>
          </div>
        </div>
      </MenuPage>
    ),
    '/dashboard/order-akun': <Order />,
    '/dashboard/deposit-saldo': <DepositTopup />,
    '/dashboard/daftar-harga': <DaftarHarga />,
    '/dashboard/tarik-saldo': <TarikSaldo />,
    '/dashboard/riwayat-pesanan': <RiwayatPesanan />,
    '/dashboard/riwayat-deposit': <MutasiSaldo />,
    '/dashboard/mutasi-saldo': <MutasiSaldo />,
    '/dashboard/profil': <Profil />,
    '/dashboard/laporan-kendala': <LaporanKendala />,
    '/dashboard/bot-wa-telegram': <BotWA />,
    '/dashboard/dokumen': <Dokumen />,
    '/dashboard/document': <Dokumen />,
  };

  if (section) {
    return (
      <AppShell
        title={pageTitles[path] || 'Menu'}
        subtitle={`${greeting}, ${session.username}. ${accountLabel} mode aktif.`}
        username={session.username}
        role={accountLabel}
        saldo={saldo}
        sections={visibleSections}
        onLogout={onLogout}
      >
        {sectionContent[path as keyof typeof sectionContent] || (
          <SectionShell title="Konten" subtitle="Halaman menu">
            <p className="text-sm text-white/55">Konten belum tersedia.</p>
          </SectionShell>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Dasbor"
      subtitle={`${greeting}, ${session.username}. Kelola transaksi dan akses API kamu dengan mudah di Premiumin Plus.`}
      username={session.username}
      role={accountLabel}
      saldo={saldo}
      sections={visibleSections}
      onLogout={onLogout}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              {greeting}, <span className="text-brand">{session.username}</span>
            </h2>
            <p className="mt-2 text-sm text-white/55 sm:text-base">
              Kelola transaksi dan akses API kamu dengan mudah di Premiumin Plus.
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 lg:flex">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            System Online
          </div>
        </div>

        <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="rounded-[1.55rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,11,21,0.96),rgba(13,9,18,0.98))] p-5 shadow-[0_0_32px_rgba(255,0,127,.06)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/35">Premiumin Card</p>
                <p className="mt-3 text-sm text-white/60">Saldo Tersedia</p>
                <div className="mt-1 flex items-end gap-2">
                  <span className="text-lg font-bold text-brand">Rp</span>
                  <span className="text-4xl font-black tracking-tight text-white">{formatNumber(saldo)}</span>
                </div>
                {saldoError ? <p className="mt-2 text-xs text-rose-200">{saldoError}</p> : null}
              </div>
              <button className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white/70 transition-transform duration-200 hover:scale-105">
                <Sparkles className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid items-center gap-4 lg:grid-cols-[1fr_0.9fr]">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/35">Card Holder</p>
                <p className="mt-1 text-base font-extrabold tracking-tight">{session.username.toUpperCase()}</p>
              </div>
              <img
                src={cardArt}
                alt="Premiumin Card"
                className="mx-auto h-44 w-full object-contain drop-shadow-[0_10px_26px_rgba(255,0,127,.22)]"
              />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => navigate('/dashboard/deposit-saldo')}
                className="rounded-2xl bg-brand px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand/20 transition-transform duration-200 hover:scale-[1.01]"
              >
                Isi Saldo
              </button>
              <button
                onClick={() => navigate('/dashboard/mutasi-saldo')}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-semibold text-white/80 transition-transform duration-200 hover:scale-[1.01] hover:bg-white/10"
              >
                Mutasi
              </button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.04 }}>
            {session.role === 'reseller' ? (
              <ApiKeyCard username={session.username} apiKey={session.apiKey} />
            ) : (
              <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-bold text-white">API Credentials</p>
                <p className="mt-2 text-sm text-white/55">Fitur tidak tersedia untuk role {accountLabel}. API key hanya aktif untuk reseller.</p>
              </div>
            )}
          </motion.div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dashboardStats.map((item, index) => {
            const Icon = item.icon;
            const toneClass =
              item.tone === 'emerald'
                ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20'
                : item.tone === 'pink'
                  ? 'bg-brand/10 text-brand ring-brand/20'
                  : item.tone === 'blue'
                    ? 'bg-sky-500/10 text-sky-300 ring-sky-500/20'
                    : 'bg-amber-500/10 text-amber-300 ring-amber-500/20';

            return (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.03 }}
                className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${toneClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{item.label}</p>
                    <p className="mt-2 text-xl font-extrabold tracking-tight text-white">
                      {item.label === 'Total Pesanan' || item.label === 'Produk Aktif' ? formatNumber(item.value) : formatCurrency(item.value)}
                      {item.suffix ? <span className="ml-2 text-sm font-semibold text-white/55">{item.suffix}</span> : null}
                    </p>
                  </div>
                </div>
                <div className="mt-2 opacity-90">
                  <Sparkline points={item.line} />
                </div>
              </motion.div>
            );
          })} 
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr_0.95fr]">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <SectionShell title="Best Penjualan" subtitle="Saldo tertinggi">
              <div className="space-y-2.5">
                {topAccounts.map((account) => {
                  const roleLabel = account.role === 'reseller' ? 'Reseller' : 'Anggota';
                  const roleTone =
                    account.role === 'reseller'
                      ? 'border-brand/25 bg-brand/10 text-brand-light'
                      : 'border-sky-500/20 bg-sky-500/10 text-sky-200';

                  return (
                    <div key={account.id} className="rounded-[1.05rem] border border-white/10 bg-[#0f0b15] px-3.5 py-3">
                      <div className="grid grid-cols-[44px_1fr_auto] items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/5 text-sm font-black text-white">
                          #{account.rank}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">{account.username}</p>
                          <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${roleTone}`}>
                            {roleLabel}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-white">{formatCurrency(account.saldo)}</p>
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Tier {String(account.rank).padStart(2, '0')}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!dashboardLoading && !topAccounts.length ? <p className="text-sm text-white/45">Belum ada data akun aktif.</p> : null}
              </div>
            </SectionShell>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}>
            <SectionShell title="Riwayat Terakhir" subtitle="Transaksi terbaru">
              <div className="space-y-4">
                {recentOrderRows.map((row) => (
                  <div key={row.invoice} className="flex items-center justify-between gap-4 border-b border-white/10 pb-4 last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-semibold text-white">{row.product_name || row.invoice}</p>
                      <p className="mt-1 text-xs text-white/35">{row.created_at || '-'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{formatCurrency(row.total_price || 0)}</p>
                      <span className="mt-1 inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                        {row.status || 'pending'}
                      </span>
                    </div>
                  </div>
                ))}
                {!dashboardLoading && !recentOrderRows.length ? <p className="text-sm text-white/45">Belum ada transaksi.</p> : null}
              </div>
            </SectionShell>
          </motion.div>

          {session.role === 'reseller' ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
            <SectionShell title="API Console" subtitle="Developer access">
              <div className="rounded-[1.1rem] border border-white/10 bg-[#0b0f1a] p-4 font-mono text-[11px] leading-6 text-white/80">
                <div className="mb-3 flex items-center justify-between text-xs text-white/35">
                  <span className="flex items-center gap-2">
                    <Code2 className="h-3.5 w-3.5 text-brand" />
                    BASH
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard/document')}
                    className="inline-flex items-center gap-1 rounded-full border border-brand/20 bg-brand/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white transition-transform duration-200 hover:scale-105"
                  >
                    Docs
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
                <pre className="whitespace-pre-wrap">
{`curl -X POST \\
https://premiumin.plus/api/order \\
-H "Content-Type: application/json" \\
-H "x-api-key: ************" \\
-d '{
  "product_id": 1,
  "qty": 1
}'

developer@premiumin:~$`}
                </pre>
              </div>
            </SectionShell>
          </motion.div>
          ) : null}
        </section>

        <footer className="py-2 text-center text-xs text-white/45">
          © 2026 Premiumin Plus. All rights reserved.
        </footer>
      </div>
    </AppShell>
  );
}
