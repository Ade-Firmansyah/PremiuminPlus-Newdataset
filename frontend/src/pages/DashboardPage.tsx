import { useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Banknote,
  BookText,
  Bot,
  ClipboardList,
  Coins,
  Code2,
  CreditCard,
  ArrowRight,
  AlertTriangle,
  HelpCircle,
  Layers3,
  MessageCircle,
  Package,
  Phone,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Send,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { AppShell, type NavSection } from '../components/layout/AppShell';
import { ApiKeyCard } from '../components/ApiKeyCard';
import { premiuminApi, type DashboardSummaryRecord, type DepositRecord, type OrderRecord } from '../services/api';
import { getApiKey } from '../store/useAuth';
import { subscribeCoreRealtime } from '../services/coreRealtime';
import { startAdaptivePolling } from '../services/adaptivePolling';
import { formatCurrency, formatNumber, getGreeting } from '../utils/format';
import cardArt from '../asset/logo-upscale.png';

const PAYMENT_STATUS_POLL_MS = 25000;

// Lazy load sub-pages untuk optimize bundle size
const BotWA = lazy(() => import('./botwa'));
const DaftarHarga = lazy(() => import('./daftarharga'));
const Dokumen = lazy(() => import('./dokumen'));
const LaporanKendala = lazy(() => import('./laporankendala'));
const MutasiSaldo = lazy(() => import('./mutasisaldo'));
const Order = lazy(() => import('./order'));
const Profil = lazy(() => import('./profil'));
const RiwayatDeposit = lazy(() => import('./riwayatdeposit'));
const RiwayatPesanan = lazy(() => import('./riwayatpesanan'));
const TarikSaldo = lazy(() => import('./tariksaldo'));

// Dashboard utama dibangun sebagai panel premium dengan hero, kartu saldo, statistik, dan menu halaman turunan.
interface DashboardPageProps {
  session: {
    username: string;
    role: string;
    apiKey: string;
    token?: string;
  };
  onLogout: () => void;
}

const sections: NavSection[] = [
  {
    label: 'Utama',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: Layers3, end: true },
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
      { label: 'Riwayat Deposit', to: '/dashboard/riwayat-deposit', icon: Coins },
      { label: 'Mutasi Saldo', to: '/dashboard/mutasi-saldo', icon: ShoppingCart },
    ],
  },
  {
    label: 'Akun',
    items: [
      { label: 'Profil', to: '/dashboard/profil', icon: Users },
      { label: 'Laporan Kendala', to: '/dashboard/laporan-kendala', icon: ShieldCheck },
      { label: 'Buat Bot WhatsApp', to: '/dashboard/bot-wa-telegram', icon: Bot },
      { label: 'Dokumen', to: '/dashboard/dokumen', icon: BookText },
    ],
  },
];

const quickDeposits = [10000, 25000, 50000, 100000, 250000, 500000];
const QR_EXPIRY_SECONDS = 30 * 60;
const pageTitles: Record<string, string> = {
  '/dashboard/komunitas-wa': 'Komunitas WA',
  '/dashboard/order-akun': 'Order Akun',
  '/dashboard/deposit-saldo': 'Deposit Saldo',
  '/dashboard/daftar-harga': 'Daftar Harga',
  '/dashboard/tarik-saldo': 'Tarik Saldo',
  '/dashboard/riwayat-pesanan': 'Riwayat Pesanan',
  '/dashboard/riwayat-deposit': 'Riwayat Deposit',
  '/dashboard/mutasi-saldo': 'Mutasi Saldo',
  '/dashboard/profil': 'Profil',
  '/dashboard/laporan-kendala': 'Laporan Kendala',
  '/dashboard/bot-wa-telegram': 'Buat Bot WhatsApp',
  '/dashboard/dokumen': 'Dokumen',
};

function Sparkline({ points }: { points: number[] }) {
  const width = 180;
  const height = 48;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = Math.max(max - min, 1);
  const step = width / (points.length - 1);
  const path = points
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

function MenuLoadingFallback() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4 lg:p-5 animate-pulse"
    >
      <div className="mb-4 h-8 w-32 rounded-lg bg-white/10" />
      <div className="space-y-3">
        <div className="h-6 w-full rounded-lg bg-white/10" />
        <div className="h-6 w-3/4 rounded-lg bg-white/10" />
      </div>
    </motion.div>
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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState('');
  const [depositResult, setDepositResult] = useState<DepositRecord | null>(null);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [adminWhatsapp, setAdminWhatsapp] = useState('');
  const autoCancelingRef = useRef('');
  const terminalRefreshRef = useRef('');
  const apiKey = getApiKey();
  const pendingDepositInvoiceKey = 'premiuminplus:pending-deposit-invoice';
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
  const terminalDeposit = ['success', 'canceled', 'failed', 'expired'].includes(String(depositResult?.status || ''));

  const parseApiDate = (input?: string | Date | null) => {
    if (!input) return null;
    if (input instanceof Date) {
      return Number.isNaN(input.getTime()) ? null : input;
    }

    const value = String(input).trim();
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const isDepositPastExpiry = (deposit?: DepositRecord | null) => {
    const expiredAt = parseApiDate(deposit?.expired_at);
    return Boolean(expiredAt && expiredAt.getTime() <= Date.now());
  };

  const getDepositStatus = (deposit?: DepositRecord | null) => String(deposit?.status || 'pending').toLowerCase();

  const canPayDeposit = (deposit: DepositRecord) => getDepositStatus(deposit) === 'pending' && !isDepositPastExpiry(deposit);

  const getStatusLabel = (status?: string) => {
    const value = String(status || 'pending').toLowerCase();
    if (value === 'success') return 'Berhasil';
    if (value === 'failed') return 'Gagal';
    if (value === 'expired') return 'Expired';
    if (value === 'canceled') return 'Dibatalkan';
    return 'Pending';
  };

  const getStatusClassName = (status?: string) => {
    const value = String(status || 'pending').toLowerCase();
    if (value === 'success') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
    if (value === 'failed' || value === 'canceled') return 'border-rose-500/20 bg-rose-500/10 text-rose-200';
    if (value === 'expired') return 'border-white/15 bg-white/5 text-white/45';
    return 'border-amber-400/25 bg-amber-400/10 text-amber-200';
  };

  const formatDepositDate = (value?: string) => {
    const date = parseApiDate(value);
    if (!date) return '-';
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const loadDepositHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await premiuminApi.deposits(apiKey || undefined);
      setDeposits(response.data);
    } catch {
      // The create/check actions already surface errors; history reload can stay quiet.
    } finally {
      setHistoryLoading(false);
    }
  }, [apiKey]);

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
    void loadDepositHistory();
  }, [loadDepositHistory]);

  useEffect(() => {
    const storedInvoice = window.localStorage.getItem(pendingDepositInvoiceKey);
    if (!storedInvoice) return;

    let active = true;
    premiuminApi.depositStatus(storedInvoice, apiKey || undefined)
      .then((response) => {
        if (!active) return;
        setDepositResult(response.data);
        void loadDepositHistory();
      })
      .catch(() => {
        if (!active) return;
        window.localStorage.removeItem(pendingDepositInvoiceKey);
      });

    return () => {
      active = false;
    };
  }, [apiKey, loadDepositHistory]);

  useEffect(() => {
    if (!depositResult) return;
    if (terminalDeposit) {
      setSecondsLeft(0);
      return;
    }
    const createdAt = parseApiDate(depositResult.created_at);
    const apiExpiryAt = parseApiDate(depositResult.expired_at);
    const fallbackExpiryAt = new Date((createdAt || new Date()).getTime() + QR_EXPIRY_SECONDS * 1000);
    const expiryAt = apiExpiryAt && apiExpiryAt.getTime() > Date.now() ? apiExpiryAt : fallbackExpiryAt;

    if (!expiryAt || Number.isNaN(expiryAt.getTime())) {
      setSecondsLeft(0);
      return;
    }

    const updateCountdown = () => {
      const next = Math.max(0, Math.floor((expiryAt.getTime() - Date.now()) / 1000));
      setSecondsLeft(next);
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [depositResult?.expired_at, depositResult?.created_at, depositResult?.status, terminalDeposit]);

  useEffect(() => {
    if (!depositResult) return;
    if (depositResult.status === 'pending' && depositResult.invoice) {
      window.localStorage.setItem(pendingDepositInvoiceKey, depositResult.invoice);
      return;
    }

    window.localStorage.removeItem(pendingDepositInvoiceKey);
  }, [depositResult?.invoice, depositResult?.status]);

  useEffect(() => {
    if (!depositResult?.invoice || !modalOpen) return;

    let active = true;
    const stopPolling = startAdaptivePolling({
      activeMs: PAYMENT_STATUS_POLL_MS,
      idleMs: 45000,
      task: async () => {
      if (!active) return;
      try {
        const response = await premiuminApi.depositStatus(depositResult.invoice, apiKey || undefined);
        if (!active) return;
        setDepositResult(response.data);
        setDeposits((current) => current.map((item) => (item.invoice === response.data.invoice ? response.data : item)));
        if (response.data.status === 'success') {
          window.dispatchEvent(new Event('premiuminplus:balance-updated'));
          void loadDepositHistory();
          active = false;
        }
        return response.data;
      } catch {
        // Manual check will surface errors; polling stays quiet to keep the modal calm.
        return null;
      }
      },
      shouldContinue: (deposit) => active && (!deposit || deposit.status === 'pending'),
    });

    return () => {
      active = false;
      stopPolling();
    };
  }, [depositResult?.invoice, modalOpen, apiKey, loadDepositHistory]);

  useEffect(() => {
    if (!depositResult?.invoice) return;
    if (!['expired', 'failed'].includes(String(depositResult.status || ''))) return;
    if (terminalRefreshRef.current === depositResult.invoice) return;

    let active = true;
    terminalRefreshRef.current = depositResult.invoice;
    premiuminApi.depositStatus(depositResult.invoice, apiKey || undefined)
      .then((response) => {
        if (active) setDepositResult(response.data);
        if (active) void loadDepositHistory();
      })
      .catch(() => {
        // Terminal refresh is best-effort; the visible status remains as-is if backend is unavailable.
      });

    return () => {
      active = false;
    };
  }, [depositResult?.invoice, depositResult?.status, apiKey, loadDepositHistory]);

  useEffect(() => {
    if (!depositResult?.invoice || !modalOpen || secondsLeft > 0) return;
    if (depositResult.status !== 'pending') return;
    if (autoCancelingRef.current === depositResult.invoice) return;

    let active = true;
    autoCancelingRef.current = depositResult.invoice;

    const cancelExpiredDeposit = async () => {
      try {
        const statusResponse = await premiuminApi.depositStatus(depositResult.invoice, apiKey || undefined);
        if (!active) return;
        if (statusResponse.data.status !== 'pending') {
          setDepositResult(statusResponse.data);
          return;
        }

        setDepositResult(statusResponse.data);
        setDeposits((current) => current.map((item) => (item.invoice === statusResponse.data.invoice ? statusResponse.data : item)));
        if (statusResponse.data.status === 'pending' && isDepositPastExpiry(statusResponse.data)) {
          setError('Waktu pembayaran habis. Deposit tetap tersimpan di Riwayat Deposit.');
        }
      } catch {
        if (active) setError('Waktu pembayaran habis. Deposit tetap tersimpan di Riwayat Deposit.');
      }
    };

    void cancelExpiredDeposit();
    return () => {
      active = false;
    };
  }, [depositResult?.invoice, depositResult?.status, modalOpen, secondsLeft, apiKey]);

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
      setDeposits((current) => [response.data, ...current.filter((item) => item.invoice !== response.data.invoice)]);
      setSecondsLeft(QR_EXPIRY_SECONDS);
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
      setDeposits((current) => current.map((item) => (item.invoice === response.data.invoice ? response.data : item)));
      if (response.data.status === 'success') {
        window.dispatchEvent(new Event('premiuminplus:balance-updated'));
        void loadDepositHistory();
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
      setDeposits((current) => current.map((item) => (item.invoice === response.data.invoice ? response.data : item)));
      window.localStorage.removeItem(pendingDepositInvoiceKey);
      window.setTimeout(() => setDepositResult(null), 650);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal membatalkan deposit.');
    } finally {
      setCanceling(false);
    }
  };

  const openExistingDeposit = async (deposit: DepositRecord) => {
    if (!canPayDeposit(deposit)) return;
    setError('');
    setDepositResult(deposit);
    window.localStorage.setItem(pendingDepositInvoiceKey, deposit.invoice);
    try {
      const response = await premiuminApi.depositStatus(deposit.invoice, apiKey || undefined);
      setDepositResult(response.data);
      setDeposits((current) => current.map((item) => (item.invoice === response.data.invoice ? response.data : item)));
      if (response.data.status === 'success') {
        window.dispatchEvent(new Event('premiuminplus:balance-updated'));
        void loadDepositHistory();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal membuka QR deposit.');
    }
  };

  const closeDepositModal = () => {
    if (depositResult?.status === 'pending' && depositResult.invoice) {
      window.localStorage.setItem(pendingDepositInvoiceKey, depositResult.invoice);
    }
    setDepositResult(null);
    setError('');
    void loadDepositHistory();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-4">
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
              'Saldo bertambah otomatis setelah pembayaran berhasil divalidasi.',
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

      <section className="rounded-[1.25rem] border border-white/10 bg-white/5 p-5 shadow-[0_14px_32px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-extrabold text-white">Riwayat Deposit</h3>
            <p className="mt-1 text-xs text-white/55">Transaksi terbaru ditampilkan paling atas. QR pending bisa dibuka kembali.</p>
          </div>
          <button
            type="button"
            onClick={loadDepositHistory}
            disabled={historyLoading}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white/75 transition hover:bg-white/10 disabled:opacity-60"
          >
            {historyLoading ? 'Memuat...' : 'Refresh'}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {deposits.map((deposit) => (
            <div key={deposit.invoice} className="grid gap-3 rounded-[1.15rem] border border-white/10 bg-[#0f0b15] px-4 py-4 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{deposit.invoice}</p>
                <p className="mt-1 text-xs text-white/40">{formatDepositDate(deposit.created_at)}</p>
                <p className="mt-2 text-sm font-black text-white">{formatCurrency(deposit.amount)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${getStatusClassName(deposit.status)}`}>
                  {getStatusLabel(deposit.status)}
                </span>
                {canPayDeposit(deposit) ? (
                  <button
                    type="button"
                    onClick={() => void openExistingDeposit(deposit)}
                    className="rounded-xl bg-brand px-4 py-2 text-xs font-black text-white shadow-lg shadow-brand/20 transition hover:scale-[1.01]"
                  >
                    Bayar
                  </button>
                ) : null}
              </div>
            </div>
          ))}
          {!historyLoading && !deposits.length ? <p className="text-sm text-white/45">Belum ada deposit.</p> : null}
        </div>
      </section>

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
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-sm"
          onClick={closeDepositModal}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            onClick={(event) => event.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden rounded-[1.5rem] border border-brand/25 bg-[#0f172a] shadow-[0_0_48px_rgba(255,46,136,0.22)]"
          >
            <button
              type="button"
              onClick={closeDepositModal}
              className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/25 text-white/75 backdrop-blur transition hover:bg-white/10"
              aria-label="Tutup QR deposit"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(255,46,136,0.18),rgba(17,24,39,0.96))] px-5 py-4">
              <div className="flex items-start justify-between gap-4 pr-10">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-light">QRIS Deposit</p>
                  <h3 className="mt-1 break-all text-xl font-black text-white">{depositResult.invoice}</h3>
                </div>
                <span className={`mt-1 shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getStatusClassName(depositResult.status)}`}>
                  {getStatusLabel(depositResult.status)}
                </span>
              </div>
            </div>

            <div className="space-y-4 p-5">
              {!terminalDeposit ? (
                <div className="mx-auto grid aspect-square max-w-[260px] place-items-center rounded-[1.25rem] border border-brand/25 bg-white p-4 shadow-[0_0_30px_rgba(255,46,136,0.18)]">
                  {qrSrc ? <img src={qrSrc} alt={`QRIS ${depositResult.invoice}`} className="h-full w-full object-contain" /> : <p className="text-center text-sm font-bold text-slate-900">QR belum tersedia</p>}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-center">
                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-white/45">Deposit {depositResult.status}</p>
                </div>
              )}

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

              {!terminalDeposit ? <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={checkDeposit}
                  disabled={checking}
                  className="rounded-2xl bg-brand px-4 py-3 text-sm font-black text-white shadow-lg shadow-brand/20 disabled:opacity-60"
                >
                  {checking ? 'Checking...' : 'Check Deposit'}
                </button>
                <button
                  type="button"
                  onClick={cancelDeposit}
                  disabled={canceling}
                  className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm font-black text-rose-100 disabled:opacity-60"
                >
                  {canceling ? 'Canceling...' : 'Cancel Deposit'}
                </button>
              </div> : null}

              {['success', 'canceled', 'failed', 'expired'].includes(String(depositResult.status)) ? (
                <button
                  type="button"
                  onClick={closeDepositModal}
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
  const [recentOrderRows, setRecentOrderRows] = useState<OrderRecord[]>([]);
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
        return !['Tarik Saldo', 'Buat Bot WhatsApp'].includes(item.label);
      }).map((item) => {
        if (session.role === 'member' && item.label === 'Riwayat Deposit') {
          return { ...item, label: 'Buat Bot WhatsApp', to: '/dashboard/bot-wa-telegram' };
        }
        return item;
      }),
    }))
    .filter((navSection) => navSection.items.length);

  const section = path === '/dashboard' ? null : path;

  const loadDashboardData = useCallback(async (quiet = false) => {
    if (!quiet) setDashboardLoading(true);
    try {
      const [meResponse, summaryResponse, orderResponse] = await Promise.all([
        premiuminApi.me(session.apiKey),
        premiuminApi.dashboardSummary(session.apiKey),
        premiuminApi.transactions(session.apiKey),
      ]);
      setSaldo(meResponse.data.saldo);
      setSummary(summaryResponse.data);
      setRecentOrderRows(orderResponse.data.slice(0, 3));
      setSaldoError('');
    } catch (caught) {
      setSaldoError(caught instanceof Error ? caught.message : 'Gagal memuat saldo.');
    } finally {
      setDashboardLoading(false);
    }
  }, [session.apiKey]);

  useEffect(() => {
    void loadDashboardData();

    let debounceTimer = 0;
    const refreshQuietly = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => void loadDashboardData(true), 1200);
    };

    const unsubscribe = subscribeCoreRealtime((payload) => {
      if (['wallet_updated', 'deposit_updated', 'payment_updated', 'order_updated', 'wallet.updated', 'finance.updated', 'dashboard.updated', 'profit.updated', 'transaction.updated', 'analytics.updated'].includes(String(payload.type))) {
        refreshQuietly();
      }
    });
    window.addEventListener('premiuminplus:balance-updated', refreshQuietly);

    return () => {
      window.clearTimeout(debounceTimer);
      unsubscribe();
      window.removeEventListener('premiuminplus:balance-updated', refreshQuietly);
    };
  }, [loadDashboardData]);

  const dashboardStats = [
    {
      label: 'Total Deposit',
      value: summary?.total_deposit_amount || 0,
      icon: Coins,
      tone: 'emerald' as const,
      suffix: '',
      line: [2, 4, 3, 5, 4, 6, 5, 7, 8, 9],
    },
    {
      label: 'Total Belanja',
      value: summary?.total_spent || 0,
      icon: ShoppingCart,
      tone: 'pink' as const,
      suffix: '',
      line: [1, 2, 2, 3, 2, 4, 3, 5, 5, 6],
    },
    {
      label: 'Total Pesanan',
      value: summary?.total_transactions || 0,
      icon: ClipboardList,
      tone: 'blue' as const,
      suffix: 'Trx',
      line: [1, 1, 2, 2, 3, 3, 4, 4, 5, 6],
    },
    {
      label: 'Produk Aktif',
      value: summary?.active_products || 0,
      icon: Package,
      tone: 'amber' as const,
      suffix: '',
      line: [2, 3, 2, 4, 4, 5, 4, 6, 7, 7],
    },
  ];

  const sectionContent: Record<string, ReactNode> = {
    '/dashboard/komunitas-wa': (
      <MenuPage title="Komunitas WA" subtitle="Ruang update reseller dan channel cepat">
        <div className="mb-4 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(16,185,129,0.14),rgba(2,132,199,0.12))] p-4 lg:p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-white/45">Slogan Komunitas</p>
            <h3 className="mt-2 text-[1.35rem] font-extrabold text-white lg:text-2xl">Tumbuh cepat, balas lebih cepat.</h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
              Komunitas ini dibuat untuk update stok, diskusi reseller, dan jalur pengumuman yang rapi. Satu kaki di WhatsApp, satu kaki di Telegram.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-[1.35rem] border border-white/10 bg-[#0f0b15] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-emerald-300">WhatsApp</p>
              <p className="mt-2 text-sm text-white/65">Fast response, diskusi hangat, dan support harian.</p>
            </div>
            <div className="rounded-[1.35rem] border border-white/10 bg-[#0f0b15] p-4">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-sky-300">Telegram</p>
              <p className="mt-2 text-sm text-white/65">Broadcast rapi, update lebih dingin, dan arsip mudah dicari.</p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ChannelCard
            title="Grup Reseller WhatsApp"
            tagline="Hijau / cepat / responsif"
            description="Tempat ngobrol reseller, tanya stok, dan dapat kabar terbaru tanpa menunggu lama."
            href="https://chat.whatsapp.com/Igg1KjY54I3A2ERIgofm4b"
            icon={MessageCircle}
            tone="bg-[linear-gradient(145deg,rgba(34,197,94,0.20),rgba(15,11,21,0.98))]"
            bullets={['Update stok', 'Support cepat', 'Komunitas aktif']}
          />
          <ChannelCard
            title="Channel Telegram"
            tagline="Biru / rapi / informatif"
            description="Channel pengumuman yang lebih tenang untuk notifikasi, arsip, dan update sistem."
            href="https://t.me/+1tkWNfTUfEg1MTY1"
            icon={Send}
            tone="bg-[linear-gradient(145deg,rgba(14,165,233,0.20),rgba(15,11,21,0.98))]"
            bullets={['Broadcast resmi', 'Arsip pengumuman', 'Informasi singkat']}
          />
        </div>
      </MenuPage>
    ),
    '/dashboard/order-akun': <Order />,
    '/dashboard/deposit-saldo': <DepositTopup />,
    '/dashboard/daftar-harga': <DaftarHarga />,
    '/dashboard/tarik-saldo': <TarikSaldo />,
    '/dashboard/riwayat-pesanan': <RiwayatPesanan />,
    '/dashboard/riwayat-deposit': <RiwayatDeposit />,
    '/dashboard/mutasi-saldo': <MutasiSaldo />,
    '/dashboard/profil': <Profil />,
    '/dashboard/laporan-kendala': <LaporanKendala />,
    '/dashboard/bot-wa-telegram': <BotWA />,
    '/dashboard/dokumen': <Dokumen />,
   
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
        <Suspense fallback={<MenuLoadingFallback />}>
          {sectionContent[path as keyof typeof sectionContent] || (
            <SectionShell title="Konten" subtitle="Halaman menu">
              <p className="text-sm text-white/55">Konten belum tersedia.</p>
            </SectionShell>
          )}
        </Suspense>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Dashboard"
      subtitle={`${greeting}, ${session.username}. Kelola transaksi dan akses API kamu dengan mudah di Premiumin Pluus.`}
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
              Kelola transaksi dan akses API kamu dengan mudah di Premiumin Pluus.
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 lg:flex">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            System Online
          </div>
        </div>

        <section className="grid gap-5 xl:grid-cols-[0.82fr_1.18fr]">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-[radial-gradient(circle_at_78%_18%,rgba(124,58,237,0.24),transparent_30%),linear-gradient(145deg,rgba(10,15,31,0.98),rgba(18,16,39,0.98))] p-4 shadow-[0_18px_42px_rgba(0,0,0,.22)]"
          >
            <div className="relative min-h-[188px] rounded-[1.1rem] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[length:18px_18px] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.24em] text-white/45">Premiumin Card</p>
                  <div className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-white/70">
                    <CreditCard className="h-3.5 w-3.5" />
                    Balance
                  </div>
                </div>
                <button className="grid h-9 w-9 place-items-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-200 transition-transform duration-200 hover:scale-105" aria-label="Saldo">
                  <Sparkles className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-7">
                <div className="flex items-end gap-2">
                  <span className="pb-1 text-sm font-bold text-white/70">Rp</span>
                  <span className="text-[2.35rem] font-black leading-none tracking-tight text-white">{formatNumber(saldo)}</span>
                </div>
                {saldoError ? <p className="mt-2 text-xs text-rose-200">{saldoError}</p> : null}
              </div>

              <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/35">Card Holder</p>
                  <p className="mt-1 truncate text-sm font-extrabold tracking-tight text-white">{session.username.toUpperCase()}</p>
                </div>
                <img src={cardArt} alt="Premiumin" className="h-10 w-10 shrink-0 object-contain opacity-80" />
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <button
                onClick={() => navigate('/dashboard/deposit-saldo')}
                className="rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 transition-transform duration-200 hover:scale-[1.01]"
              >
                Isi Saldo
              </button>
              <button
                onClick={() => navigate('/dashboard/tarik-saldo')}
                className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100 transition-transform duration-200 hover:scale-[1.01] hover:bg-emerald-500/15"
              >
                Tarik Saldo
              </button>
              <button
                onClick={() => navigate('/dashboard/mutasi-saldo')}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/80 transition-transform duration-200 hover:scale-[1.01] hover:bg-white/10"
              >
                Mutasi
              </button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.04 }}>
            <ApiKeyCard username={session.username} apiKey={session.apiKey} />
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
                className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4 shadow-[0_14px_30px_rgba(0,0,0,0.12)]"
              >
                <div className="flex items-start gap-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ${toneClass}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{item.label}</p>
                    <p className="mt-2 text-xl font-extrabold tracking-tight text-white">
                      {item.label === 'Total Pesanan' || item.label === 'Produk Aktif' ? formatNumber(item.value) : formatCurrency(item.value)}
                      {item.suffix ? <span className="ml-2 text-sm font-semibold text-white/55">{item.suffix}</span> : null}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr_0.95fr]">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <SectionShell title="Top Sultan" subtitle="Penjualan terbanyak">
              <div className="space-y-3">
                {(summary?.top_users || []).map((item, index) => (
                  <div key={item.user_id} className="rounded-[1.2rem] border border-white/10 bg-[#0f0b15] px-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{index + 1}. {item.username}</p>
                        <span className="mt-1 inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">
                          {formatNumber(item.total_orders)} pesanan
                        </span>
                      </div>
                      <p className="shrink-0 text-sm font-extrabold text-brand sm:text-base">{formatCurrency(item.total_sales)}</p>
                    </div>
                  </div>
                ))}
                {!dashboardLoading && !(summary?.top_users || []).length ? <p className="text-sm text-white/45">Belum ada data penjualan user.</p> : null}
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
                    onClick={() => navigate('/dashboard/dokumen')}
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
        </section>

        <footer className="py-2 text-center text-xs text-white/45">
          © 2026 Premiumin Pluus. All rights reserved.
        </footer>
      </div>
    </AppShell>
  );
}

