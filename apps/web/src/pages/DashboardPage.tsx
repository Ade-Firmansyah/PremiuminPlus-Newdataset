import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Banknote,
  Bell,
  ClipboardList,
  Copy,
  CreditCard,
  KeyRound,
  Loader2,
  Package,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { motion } from 'motion/react';
import { AppShell } from '../components/layout/AppShell';
import { canAccessDashboardPath, getDashboardSections } from '../config/navigation';
import { useStablePolling } from '../hooks/useStablePolling';
import { premiuminApi, type DashboardRecord, type DepositRecord, type ProductRecord } from '../services/api';
import { saveApiKey } from '../store/useAuth';
import { formatCurrency, formatNumber, getGreeting, maskKey } from '../utils/format';
import BotWA from './botwa';
import DaftarHarga from './daftarharga';
import Dokumen from './dokumen';
import LaporanKendala from './laporankendala';
import MutasiSaldo from './mutasisaldo';
import Order from './order';
import Profil from './profil';
import RiwayatPesanan from './riwayatpesanan';
import TarikSaldo from './tariksaldo';

const TransactionChart = lazy(() =>
  import('../components/dashboard/TransactionChart').then((module) => ({ default: module.TransactionChart })),
);

interface DashboardPageProps {
  session: {
    username: string;
    role: string;
    apiKey: string;
  };
  onLogout: () => void;
  maintenanceActive?: boolean;
  maintenanceMessage?: string;
}

const emptyDashboard: DashboardRecord = {
  saldo: 0,
  total_deposit: 0,
  total_order: 0,
  total_transactions: 0,
  total_profit: 0,
  bot_ledger: {
    total_masuk: 0,
    total_keluar: 0,
    profit: 0,
  },
  recent_transactions: [],
  chart_data: [],
  products: [],
};

const pageMeta: Record<string, { title: string; subtitle: string; content: ReactNode }> = {
  '/dashboard/komunitas-wa': {
    title: 'Group Komunitas',
    subtitle: 'Kumpulan group resmi untuk support, kolaborasi, dan update layanan Premiumin Plus.',
    content: <CommunityPage />,
  },
  '/dashboard/order-akun': {
    title: 'Order Akun',
    subtitle: 'Beli produk digital premium dari backend resmi.',
    content: <Order />,
  },
  '/dashboard/deposit-saldo': {
    title: 'Deposit Saldo',
    subtitle: 'Top up saldo otomatis dan realtime.',
    content: null,
  },
  '/dashboard/daftar-harga': {
    title: 'Produk',
    subtitle: 'Daftar produk, harga, dan stok terbaru.',
    content: <DaftarHarga />,
  },
  '/dashboard/tarik-saldo': {
    title: 'Withdraw',
    subtitle: 'Ajukan penarikan saldo reseller.',
    content: <TarikSaldo />,
  },
  '/dashboard/riwayat-pesanan': {
    title: 'Riwayat Transaksi',
    subtitle: 'Pantau order, deposit, dan status transaksi.',
    content: <RiwayatPesanan />,
  },
  '/dashboard/mutasi-saldo': {
    title: 'Mutasi Saldo',
    subtitle: 'Riwayat perubahan saldo wallet.',
    content: <MutasiSaldo />,
  },
  '/dashboard/api-key': {
    title: 'API Key',
    subtitle: 'Kredensial integrasi untuk website dan bot.',
    content: null,
  },
  '/dashboard/profit-analytics': {
    title: 'Profit Bersih',
    subtitle: 'Deposit dikurangi order untuk melihat keuntungan bersih.',
    content: null,
  },
  '/dashboard/margin-setting': {
    title: 'Bot WhatsApp',
    subtitle: 'Kelola margin bot reseller, QR login, session, dan automation WhatsApp.',
    content: <BotWA />,
  },
  '/dashboard/profil': {
    title: 'Profil',
    subtitle: 'Lihat dan perbarui profil akun Anda.',
    content: <Profil />,
  },
  '/dashboard/bot-wa-telegram': {
    title: 'Bot WhatsApp',
    subtitle: 'Kelola automation WhatsApp premium.',
    content: <BotWA />,
  },
  '/dashboard/dokumen': {
    title: 'Dokumen',
    subtitle: 'Dokumentasi teknis Premiumin Plus.',
    content: <Dokumen />,
  },
  '/dashboard/document': {
    title: 'Dokumen',
    subtitle: 'Dokumentasi teknis Premiumin Plus.',
    content: <Dokumen />,
  },
  '/dashboard/laporan-kendala': {
    title: 'Laporan Kendala',
    subtitle: 'Laporkan masalah transaksi atau produk.',
    content: <LaporanKendala />,
  },
};

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-[#0b1020]/82 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur-xl ${className}`}>
      {children}
    </section>
  );
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.07] ${className}`} />;
}

function SectionTitle({ kicker, title, action }: { kicker: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/35">{kicker}</p>
        <h2 className="mt-1 text-lg font-black tracking-tight text-white">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
  loading,
  suffix,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: string;
  loading: boolean;
  suffix?: string;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="h-10 w-20 overflow-hidden rounded-full opacity-70">
          <svg viewBox="0 0 96 36" className="h-full w-full">
            <path d="M0 25 C 16 2, 28 32, 44 14 S 72 24, 96 7" fill="none" stroke="currentColor" strokeWidth="3" className="text-[#ff2f92]" />
          </svg>
        </div>
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-white/38">{label}</p>
      {loading ? <SkeletonBlock className="mt-3 h-8 w-32" /> : <p className="mt-2 text-2xl font-black tracking-tight text-white">{value}<span className="ml-2 text-sm text-white/42">{suffix}</span></p>}
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = normalized.includes('success') || normalized.includes('sukses')
    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
    : normalized.includes('failed') || normalized.includes('gagal')
      ? 'border-rose-400/25 bg-rose-400/10 text-rose-200'
      : 'border-amber-400/25 bg-amber-400/10 text-amber-200';
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tone}`}>{status || 'pending'}</span>;
}

const userApiEndpoints = [
  ['GET', '/me', 'Profil, role, saldo, locked balance, dan API key aktif.'],
  ['GET', '/products', 'Katalog produk dengan harga final sesuai role reseller/admin.'],
  ['POST', '/order', 'Order langsung memakai saldo. Body: product_id, qty.'],
  ['GET', '/order/:invoice', 'Cek status order dan buka credential saat order sukses.'],
  ['GET', '/orders', 'Riwayat order akun pemilik API key.'],
  ['POST', '/payments/direct-order', 'Buat QRIS order langsung tanpa potong saldo dulu.'],
  ['GET', '/payments/:invoice/status', 'Cek status QRIS order dan proses provider setelah success.'],
  ['POST', '/deposit', 'Buat QRIS deposit saldo. Body: amount.'],
  ['GET', '/deposit/:invoice', 'Cek status deposit dan kredit saldo sekali saat success.'],
  ['GET', '/saldo/logs', 'Mutasi saldo legacy-compatible.'],
  ['POST', '/withdraw', 'Ajukan tarik saldo minimal Rp50.000.'],
  ['GET', '/withdraws', 'Riwayat withdraw dan status admin.'],
];

const publicApiEndpoints = [
  ['POST', '/profile', 'Profil, role, saldo, usable balance, dan locked balance.'],
  ['POST', '/products', 'Katalog lokal, harga role, markup API, serta stok provider/manual/hybrid.'],
  ['POST', '/stock', 'Stok gabungan Premiumin Plus berdasarkan product_id.'],
  ['POST', '/pay', 'Buat QRIS pembeli akhir. Provider baru diorder setelah pembayaran sukses.'],
  ['POST', '/pay_status', 'Cek pembayaran dan jalankan ledger B2B secara idempoten saat sukses.'],
  ['POST', '/cancel_pay', 'Batalkan payment pending milik API key yang sama.'],
  ['POST', '/order', 'Order langsung memakai saldo Premiumin Plus.'],
  ['POST', '/status', 'Cek order dan tampilkan credential hanya setelah sukses.'],
];

const resellerApiEndpoints = [
  ['GET', '/bot/catalog', 'Katalog bot dengan harga jual sesuai margin reseller.'],
  ['POST', '/bot/order/init', 'Buat QRIS order bot, catat uang masuk/modal/profit.'],
  ['GET', '/bot/order/:invoice/status', 'Cek status QRIS dan order bot.'],
  ['GET', '/bot/history', 'Riwayat transaksi bot reseller.'],
  ['GET', '/bot/analytics', 'Profit dan statistik order bot.'],
  ['POST', '/bot/session/connect', 'Connect WhatsApp session dan tampilkan QR login.'],
];

function DashboardApiKeyPanel({
  username,
  apiKey,
  maintenanceActive = false,
  compact = false,
}: {
  username: string;
  apiKey: string;
  maintenanceActive?: boolean;
  compact?: boolean;
}) {
  const [key, setKey] = useState(apiKey);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiTab, setApiTab] = useState<'public' | 'internal'>('public');
  const [exampleLanguage, setExampleLanguage] = useState<'curl' | 'node' | 'php' | 'python'>('curl');
  const apiBaseUrl = useMemo(() => {
    const configured = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    if (configured) return configured;
    return `${window.location.origin}/api`;
  }, []);
  const publicApiBaseUrl = `${apiBaseUrl}/public/v1`;
  const selectedBaseUrl = apiTab === 'public' ? publicApiBaseUrl : apiBaseUrl;
  const selectedEndpoints = apiTab === 'public' ? publicApiEndpoints : userApiEndpoints;
  const exampleKey = visible ? key : 'YOUR_API_KEY';
  const publicExamples = {
    curl: `curl -X POST ${publicApiBaseUrl}/pay \\
  -H "content-type: application/json" \\
  -H "x-api-key: ${exampleKey}" \\
  -d "{\\"product_id\\":8,\\"amount\\":670,\\"ref_id\\":\\"INV-USER-001\\",\\"buyer_whatsapp\\":\\"6281234567890\\"}"`,
    node: `const response = await fetch('${publicApiBaseUrl}/pay', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': '${exampleKey}'
  },
  body: JSON.stringify({
    product_id: 8,
    amount: 670,
    ref_id: 'INV-USER-001',
    buyer_whatsapp: '6281234567890'
  })
});
const result = await response.json();`,
    php: `$response = file_get_contents('${publicApiBaseUrl}/pay', false, stream_context_create([
  'http' => [
    'method' => 'POST',
    'header' => "content-type: application/json\\r\\nx-api-key: ${exampleKey}\\r\\n",
    'content' => json_encode([
      'product_id' => 8,
      'amount' => 670,
      'ref_id' => 'INV-USER-001',
      'buyer_whatsapp' => '6281234567890'
    ])
  ]
]));`,
    python: `import json
from urllib.request import Request, urlopen

payload = json.dumps({
    "product_id": 8,
    "amount": 670,
    "ref_id": "INV-USER-001",
    "buyer_whatsapp": "6281234567890"
}).encode()

request = Request(
    "${publicApiBaseUrl}/pay",
    data=payload,
    headers={
        "content-type": "application/json",
        "x-api-key": "${exampleKey}"
    },
    method="POST"
)

with urlopen(request, timeout=20) as response:
    result = json.load(response)`,
  };
  const curlOrder = `curl -X POST ${apiBaseUrl}/order \\
  -H "content-type: application/json" \\
  -H "x-api-key: ${visible ? key : 'YOUR_API_KEY'}" \\
  -d "{\\"product_id\\":123,\\"qty\\":1}"`;
  const curlQris = `curl -X POST ${apiBaseUrl}/payments/direct-order \\
  -H "content-type: application/json" \\
  -H "x-api-key: ${visible ? key : 'YOUR_API_KEY'}" \\
  -d "{\\"product_id\\":123,\\"qty\\":1,\\"target_whatsapp\\":\\"6281234567890\\"}"`;

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await premiuminApi.myApiKey(apiKey);
      setKey(response.data.api_key || apiKey);
    } catch {
      setKey(apiKey);
    } finally {
      setLoading(false);
    }
  };

  const regenerate = async () => {
    if (maintenanceActive) {
      window.alert('Maintenance aktif. Transaksi sementara dinonaktifkan.');
      return;
    }
    if (!window.confirm('Regenerate API key? Key lama akan langsung tidak berlaku.')) return;
    setLoading(true);
    try {
      const response = await premiuminApi.regenerateMyApiKey(key || apiKey);
      const nextKey = response.data.api_key;
      const rawSession = localStorage.getItem('premiuminplus:session') || sessionStorage.getItem('premiuminplus:session');
      const remembered = Boolean(localStorage.getItem('premiuminplus:session'));
      if (rawSession) {
        const session = JSON.parse(rawSession);
        const nextSession = { ...session, apiKey: nextKey };
        const storage = remembered ? localStorage : sessionStorage;
        storage.setItem('premiuminplus:session', JSON.stringify(nextSession));
        saveApiKey(nextKey, remembered);
      }
      setKey(nextKey);
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'Gagal regenerate API key.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  };

  if (compact) {
    return (
      <Panel className="p-3">
        <SectionTitle
          kicker="Developer"
          title="API Key"
          action={(
            <Link to="/dashboard/api-key" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/72 transition hover:border-brand/35 hover:bg-brand/10 hover:text-white" aria-label="Buka dokumentasi API Key">
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        />

        <div className="min-w-0 rounded-xl border border-white/10 bg-[#050816] px-3 py-2.5">
          <p className="truncate font-mono text-xs leading-5 tracking-[0.06em] text-white/82">{visible ? key : maskKey(key)}</p>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button onClick={() => setVisible((value) => !value)} className="rounded-xl border border-white/10 bg-white/[0.06] px-2 py-2 text-xs font-bold text-white/80">{visible ? 'Hide' : 'Show'}</button>
          <button onClick={copy} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#ff2f92] px-2 py-2 text-xs font-bold text-white">
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'OK' : 'Copy'}
          </button>
          <button onClick={refresh} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-2 py-2 text-xs font-bold text-white/80">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <SectionTitle kicker="Developer" title="API Key" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-white/10 bg-[#050816] p-4">
          <p className="text-xs text-white/38">Pengguna: {username}</p>
          <p className="mt-2 break-all font-mono text-sm tracking-[0.16em] text-white">{visible ? key : maskKey(key)}</p>
          <p className="mt-3 text-xs leading-5 text-white/45">
            API key ini bisa dipakai reseller untuk integrasi server, bot pribadi, cron, atau aplikasi internal.
            Semua request wajib lewat backend Premiumin Plus dan memakai header <code>x-api-key</code>.
          </p>
        </div>
        <div className="rounded-2xl border border-brand/20 bg-brand/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-light">Base URL</p>
          <p className="mt-2 break-all font-mono text-xs text-white">{selectedBaseUrl}</p>
          <p className="mt-3 text-xs leading-5 text-white/55">Production: <b className="text-white">https://premiuminplus.store/api/public/v1</b></p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button onClick={() => setVisible((value) => !value)} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/80">{visible ? 'Sembunyikan' : 'Tampilkan'}</button>
        <button onClick={copy} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#ff2f92] px-3 py-2 text-xs font-bold text-white">
          <Copy className="h-3.5 w-3.5" />
          {copied ? 'OK' : 'Copy'}
        </button>
        <button onClick={refresh} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/80">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Sync
        </button>
        <button onClick={regenerate} disabled={loading || maintenanceActive} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-100 disabled:opacity-60">
          Regenerate
        </button>
      </div>

      <div className="mt-4 inline-flex border border-white/10 bg-black/20 p-1">
        <button onClick={() => setApiTab('public')} className={`px-3 py-2 text-xs font-black ${apiTab === 'public' ? 'bg-[#ff2f92] text-white' : 'text-white/55'}`}>Public API v1</button>
        <button onClick={() => setApiTab('internal')} className={`px-3 py-2 text-xs font-black ${apiTab === 'internal' ? 'bg-[#ff2f92] text-white' : 'text-white/55'}`}>Internal API</button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/38">{apiTab === 'public' ? 'Public API v1' : 'Internal API existing'}</p>
          <div className="mt-3 grid gap-2">
            {selectedEndpoints.map(([method, path, description]) => (
              <div key={`${method}-${path}`} className="grid gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs sm:grid-cols-[130px_minmax(0,1fr)]">
                <code className="font-black text-white">{method} {path}</code>
                <span className="text-white/55">{description}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-white/45">
            {apiTab === 'public'
              ? 'Gunakan ref_id unik pada /pay dan /order. Retry dengan ref_id yang sama mengembalikan transaksi yang sama tanpa debit atau order provider kedua.'
              : 'Endpoint internal tetap tersedia untuk dashboard, integrasi existing, dan managed Bot Engine.'}
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/38">Header wajib</p>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/75">{`x-api-key: ${visible ? key : 'YOUR_API_KEY'}
authorization: Bearer ${visible ? key : 'YOUR_API_KEY'}
content-type: application/json`}</pre>
            <p className="mt-3 text-xs leading-5 text-white/50">Pilih salah satu: <code>x-api-key</code> atau <code>Authorization: Bearer</code>. Jangan kirim key berbeda di dua header sekaligus.</p>
            <p className="mt-3 text-xs leading-5 text-amber-100/75">Jangan simpan API key di frontend publik, GitHub, atau localStorage aplikasi milik customer.</p>
          </div>
          <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Aturan saldo</p>
            <p className="mt-3 text-xs leading-5 text-white/60">Order saldo memakai usable balance: saldo dikurangi locked balance bot. Jika saldo tidak cukup, API mengembalikan 402 dengan detail required dan available.</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/38">{apiTab === 'public' ? 'Contoh Public API' : 'Contoh order saldo'}</p>
          {apiTab === 'public' ? (
            <div className="mt-3 inline-flex border border-white/10 bg-black/20 p-1">
              {(['curl', 'node', 'php', 'python'] as const).map((language) => (
                <button key={language} onClick={() => setExampleLanguage(language)} className={`px-3 py-1.5 text-xs font-black uppercase ${exampleLanguage === language ? 'bg-white/10 text-white' : 'text-white/45'}`}>{language}</button>
              ))}
            </div>
          ) : null}
          <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-3 text-xs leading-5 text-white/75">{apiTab === 'public' ? publicExamples[exampleLanguage] : curlOrder}</pre>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Body JSON</p>
            <pre className="mt-2 overflow-x-auto text-xs text-white/70">{apiTab === 'public' ? `{
  "product_id": 8,
  "amount": 670,
  "ref_id": "INV-USER-001"
}` : `{
  "product_id": 123,
  "qty": 1
}`}</pre>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/38">{apiTab === 'public' ? 'Ledger B2B' : 'Contoh QRIS order'}</p>
          {apiTab === 'public' ? (
            <div className="mt-3 space-y-2 text-xs leading-5 text-white/60">
              <p>Pembayaran sukses: owner API menerima mutasi masuk sebesar sell price lalu mutasi keluar sebesar base price.</p>
              <p>Profit owner = sell price - base price. Profit admin = base price - provider cost. Profit tidak dikreditkan dua kali ke saldo.</p>
              <p>Polling status dibatasi cache backend. Credential hanya tampil setelah fulfillment sukses.</p>
            </div>
          ) : (
            <>
              <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-3 text-xs leading-5 text-white/75">{curlQris}</pre>
              <p className="mt-3 text-xs leading-5 text-white/45">QRIS order langsung tidak memotong saldo saat dibuat. Backend memproses order hanya setelah status QRIS success.</p>
            </>
          )}
        </div>
      </div>

      {apiTab === 'internal' ? <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-white/38">Endpoint khusus reseller bot</p>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          {resellerApiEndpoints.map(([method, path, description]) => (
            <div key={`${method}-${path}`} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <code className="font-black text-white">{method} {path}</code>
              <p className="mt-1 leading-5 text-white/50">{description}</p>
            </div>
          ))}
        </div>
      </div> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {[
          ['200', 'Berhasil. Data ada di field data.'],
          ['401', 'API key kosong/salah/regenerated.'],
          ['402', 'Saldo usable tidak cukup untuk order saldo.'],
          ['403', 'Role tidak sesuai atau akun nonaktif.'],
          ['404', 'Invoice/produk tidak ditemukan.'],
          ['409', 'Stok/qty/status transaksi bentrok.'],
          ['503/5xx', 'Maintenance/provider bermasalah; retry dengan backoff dari server.'],
        ].map(([code, text]) => (
          <div key={code} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-lg font-black text-white">{code}</p>
            <p className="mt-1 text-xs leading-5 text-white/50">{text}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CommunityPage() {
  const [settings, setSettings] = useState<{ group_link: string; pinned_message: string; announcement: string; support_text: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    premiuminApi.communitySettings()
      .then((response) => {
        if (active) setSettings(response.data);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Gagal memuat komunitas.');
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Panel>
      <SectionTitle kicker="Official Community" title="Group Komunitas" />
      {error ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      {!settings ? <SkeletonBlock className="h-32 w-full" /> : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h3 className="text-sm font-black text-white">{settings.announcement || 'Komunitas Premiumin Plus'}</h3>
          <p className="mt-2 text-sm leading-6 text-white/60">{settings.pinned_message || settings.support_text || 'Info komunitas belum diatur admin.'}</p>
          {settings.group_link ? (
            <a href={settings.group_link} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-black text-white">
              Buka Group
              <ArrowRight className="h-4 w-4" />
            </a>
          ) : <p className="mt-4 text-sm text-white/45">Link komunitas belum tersedia.</p>}
        </div>
      )}
    </Panel>
  );
}

function ProductMiniTable({ products, loading }: { products: DashboardRecord['products']; loading: boolean }) {
  return (
    <Panel>
      <SectionTitle kicker="Catalog" title="Produk Terlaris" />
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-white/38">
            <tr>
              <th className="px-3 py-3">Product</th>
              <th className="px-3 py-3">Price</th>
              <th className="px-3 py-3">Stock</th>
              <th className="px-3 py-3 text-right">Sold</th>
            </tr>
          </thead>
          <tbody>
            {loading ? [1, 2, 3, 4].map((item) => (
              <tr key={item} className="border-t border-white/10">
                <td colSpan={4} className="px-3 py-3"><SkeletonBlock className="h-5 w-full" /></td>
              </tr>
            )) : products.slice(0, 6).map((product) => (
              <tr key={product.product} className="border-t border-white/10 text-white/72">
                <td className="px-3 py-3 font-semibold text-white">{product.product}</td>
                <td className="px-3 py-3">{formatCurrency(product.price)}</td>
                <td className="px-3 py-3">
                  {product.stock > 0 ? <span>{formatNumber(product.stock)}</span> : <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 text-[10px] font-black text-rose-200">Belum tersedia</span>}
                </td>
                <td className="px-3 py-3 text-right">{formatNumber(product.sold)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !products.length ? <p className="mt-4 text-sm text-white/45">Produk belum tersedia.</p> : null}
    </Panel>
  );
}

function TransactionsPanel({ rows, loading }: { rows: DashboardRecord['recent_transactions']; loading: boolean }) {
  return (
    <Panel>
      <SectionTitle kicker="Realtime" title="Riwayat Transaksi" />
      <div className="space-y-2">
        {loading ? [1, 2, 3, 4].map((item) => <SkeletonBlock key={item} className="h-16 w-full" />) : rows.slice(0, 6).map((row) => (
          <div key={row.invoice} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">{row.invoice}</p>
              <p className="mt-1 text-xs text-white/38">{row.type} • {row.date || '-'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-white">{formatCurrency(row.amount)}</p>
              <div className="mt-1"><StatusBadge status={row.status} /></div>
            </div>
          </div>
        ))}
      </div>
      {!loading && !rows.length ? <p className="text-sm text-white/45">Belum ada transaksi.</p> : null}
    </Panel>
  );
}

function QuickActions({ maintenanceActive = false }: { maintenanceActive?: boolean }) {
  const navigate = useNavigate();
  const actions = [
    { label: 'Order', icon: ShoppingBag, to: '/dashboard/order-akun' },
    { label: 'Deposit', icon: CreditCard, to: '/dashboard/deposit-saldo' },
    { label: 'Withdraw', icon: Banknote, to: '/dashboard/tarik-saldo' },
    { label: 'API Key', icon: KeyRound, to: '/dashboard/api-key' },
  ];

  return (
    <Panel>
      <SectionTitle kicker="Shortcut" title="Quick Action" />
      <div className="grid grid-cols-2 gap-2">
        {actions.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => {
                if (maintenanceActive && ['Order', 'Deposit', 'Withdraw'].includes(item.label)) {
                  window.alert('Maintenance aktif. Transaksi sementara dinonaktifkan.');
                  return;
                }
                navigate(item.to);
              }}
              className="rounded-xl border border-white/10 bg-white/[0.055] p-3 text-left transition hover:border-[#ff2f92]/40 hover:bg-[#ff2f92]/10"
            >
              <Icon className="h-4 w-4 text-[#ff72b9]" />
              <p className="mt-2 text-sm font-black text-white">{item.label}</p>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function renderDepositQr(value?: string | null) {
  if (!value) return '';
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

function normalizeDepositUiStatus(status?: string | null) {
  const value = String(status || 'pending').toLowerCase();
  if (value === 'pending_payment') return 'pending';
  if (value === 'payment_mismatch' || value === 'manual_required') return 'failed';
  return value;
}

function isExpiredTimestamp(value?: string | null) {
  if (!value) return false;
  const expiry = new Date(value).getTime();
  return Number.isFinite(expiry) && expiry <= Date.now();
}

function formatPaymentCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const rest = safeSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function paymentStatusTone(status: string) {
  if (status === 'success') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';
  if (status === 'pending') return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
  if (status === 'expired' || status === 'canceled') return 'border-white/10 bg-white/5 text-white/45';
  return 'border-rose-500/20 bg-rose-500/10 text-rose-200';
}

const depositHistoryStorageKey = 'premiuminplus:deposit-payment-history';

interface DepositHistoryItem {
  invoice: string;
  amount: number;
  total_bayar: number;
  status: string;
  expired_at?: string | null;
  created_at?: string | null;
}

function readDepositHistory() {
  try {
    const raw = localStorage.getItem(depositHistoryStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.invoice).slice(0, 8) as DepositHistoryItem[] : [];
  } catch {
    return [];
  }
}

function DepositPage({ apiKey, maintenanceActive = false }: { apiKey: string; maintenanceActive?: boolean }) {
  const [amount, setAmount] = useState(50000);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [deposit, setDeposit] = useState<DepositRecord | null>(null);
  const [depositHistory, setDepositHistory] = useState<DepositHistoryItem[]>(() => readDepositHistory());
  const [paymentSecondsLeft, setPaymentSecondsLeft] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const expiryCheckRef = useRef('');
  const quickAmounts = [10000, 25000, 50000, 100000, 250000, 500000];
  const depositStatusRaw = normalizeDepositUiStatus(deposit?.status);
  const depositStatusExpiredByTime = depositStatusRaw === 'pending' && Boolean(deposit?.expired_at) && paymentSecondsLeft <= 0 && isExpiredTimestamp(deposit?.expired_at);
  const depositStatus = depositStatusExpiredByTime ? 'expired' : depositStatusRaw;
  const depositPending = Boolean(deposit && depositStatus === 'pending');
  const depositTerminal = Boolean(deposit && ['success', 'failed', 'expired', 'canceled'].includes(depositStatus));
  const qrSource = renderDepositQr(deposit?.qr_image || deposit?.qr_raw || deposit?.qr_data);
  const canShowDepositQr = Boolean(depositPending && paymentSecondsLeft > 0 && qrSource);

  const rememberDeposit = useCallback((record: DepositRecord) => {
    const item: DepositHistoryItem = {
      invoice: record.invoice,
      amount: Number(record.amount || 0),
      total_bayar: Number(record.total_bayar || record.amount || 0),
      status: normalizeDepositUiStatus(record.status),
      expired_at: record.expired_at || null,
      created_at: record.created_at || new Date().toISOString(),
    };
    setDepositHistory((current) => {
      const next = [item, ...current.filter((history) => history.invoice !== item.invoice)].slice(0, 8);
      localStorage.setItem(depositHistoryStorageKey, JSON.stringify(next));
      return next;
    });
  }, []);

  const checkDeposit = useCallback(async (invoice = deposit?.invoice) => {
    if (!invoice || checking) return;
    setChecking(true);
    setError('');
    try {
      const response = await premiuminApi.depositStatus(invoice, apiKey);
      setDeposit(response.data);
      rememberDeposit(response.data);
      const nextStatus = normalizeDepositUiStatus(response.data.status);
      if (nextStatus === 'success') {
        setMessage('Deposit sukses. Saldo masuk sesuai nominal deposit.');
        window.dispatchEvent(new Event('premiuminplus:balance-updated'));
      } else if (nextStatus === 'expired') {
        setMessage('QR deposit sudah expired. Silakan buat deposit baru.');
      } else if (nextStatus === 'canceled') {
        setMessage('Deposit sudah dibatalkan.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal mengecek deposit.');
    } finally {
      setChecking(false);
    }
  }, [apiKey, checking, deposit?.invoice, rememberDeposit]);

  useStablePolling(
    () => checkDeposit(deposit?.invoice),
    15000,
    {
      enabled: depositPending,
      immediate: false,
      pauseWhenHidden: true,
      focusThrottleMs: 10000,
    },
  );

  const submit = async () => {
    if (maintenanceActive) {
      setError('Maintenance aktif. Transaksi sementara dinonaktifkan.');
      return;
    }
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const response = await premiuminApi.deposit({ amount }, apiKey);
      setDeposit(response.data);
      rememberDeposit(response.data);
      setMessage(`Deposit ${response.data.invoice} dibuat. Bayar sesuai total QRIS.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal membuat deposit.');
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    if (!deposit?.invoice || !depositPending) return;
    setLoading(true);
    setError('');
    try {
      const response = await premiuminApi.depositCancel(deposit.invoice, apiKey);
      setDeposit(response.data);
      rememberDeposit(response.data);
      setMessage('Deposit dibatalkan.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal membatalkan deposit.');
    } finally {
      setLoading(false);
    }
  };

  const openDepositHistory = async (invoice: string) => {
    setChecking(true);
    setError('');
    try {
      const response = await premiuminApi.depositStatus(invoice, apiKey);
      setDeposit(response.data);
      rememberDeposit(response.data);
      const nextStatus = normalizeDepositUiStatus(response.data.status);
      if (nextStatus === 'success') setMessage('Deposit sukses. Saldo masuk sesuai nominal deposit.');
      else if (nextStatus === 'expired') setMessage('QR deposit sudah expired. Silakan buat deposit baru.');
      else if (nextStatus === 'canceled') setMessage('Deposit sudah dibatalkan.');
      else setMessage(`Deposit ${response.data.invoice} dibuka ulang.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal membuka ulang deposit.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!deposit?.expired_at || normalizeDepositUiStatus(deposit.status) !== 'pending') {
      setPaymentSecondsLeft(0);
      expiryCheckRef.current = '';
      return;
    }
    const update = () => {
      const next = Math.max(0, Math.floor((new Date(deposit.expired_at || '').getTime() - Date.now()) / 1000));
      setPaymentSecondsLeft(Number.isFinite(next) ? next : 0);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [deposit?.expired_at, deposit?.status]);

  useEffect(() => {
    if (!deposit?.invoice || normalizeDepositUiStatus(deposit.status) !== 'pending' || paymentSecondsLeft > 0) return;
    const expiry = new Date(deposit.expired_at || '').getTime();
    if (!Number.isFinite(expiry) || expiry > Date.now()) return;
    if (expiryCheckRef.current === deposit.invoice) return;
    expiryCheckRef.current = deposit.invoice;
    void checkDeposit(deposit.invoice);
  }, [checkDeposit, deposit?.expired_at, deposit?.invoice, deposit?.status, paymentSecondsLeft]);

  return (
    <Panel>
      <SectionTitle kicker="Wallet" title="Deposit Saldo" />
      <div className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <label className="text-xs font-black uppercase tracking-[0.2em] text-white/38">Nominal Deposit</label>
          <div className="mt-3 flex items-center rounded-2xl border border-white/10 bg-[#050816] px-4 py-4">
            <span className="text-lg font-black text-white/50">Rp</span>
            <input
              value={amount.toLocaleString('id-ID')}
              onChange={(event) => setAmount(Number(event.target.value.replace(/\D/g, '')) || 0)}
              inputMode="numeric"
              className="ml-2 w-full bg-transparent text-3xl font-black text-white outline-none"
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {quickAmounts.map((value) => (
              <button
                key={value}
                onClick={() => setAmount(value)}
                className={`rounded-xl border px-3 py-3 text-sm font-black transition ${amount === value ? 'border-[#ff2f92]/45 bg-[#ff2f92]/12 text-white' : 'border-white/10 bg-white/[0.045] text-white/65 hover:bg-white/[0.08]'}`}
              >
                {formatCurrency(value)}
              </button>
            ))}
          </div>
          {message ? <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
          {error ? <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
          <button onClick={submit} disabled={loading || amount < 1000 || maintenanceActive} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ff2f92] text-sm font-black text-white shadow-lg shadow-[#ff2f92]/20 disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {depositTerminal ? 'Buat Deposit Baru' : 'Buat Pembayaran'}
          </button>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
          {deposit ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-white">QRIS Deposit</p>
                  <p className="mt-1 break-all text-xs text-white/42">{deposit.invoice}</p>
                </div>
                <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">
                  {depositStatus}
                </span>
              </div>
              <div className={`rounded-2xl border p-3 ${canShowDepositQr ? 'border-white/10 bg-white' : 'border-white/10 bg-black/20'}`}>
                {canShowDepositQr ? (
                  <img src={qrSource} alt="QRIS Deposit" className="mx-auto aspect-square w-full max-w-[260px] rounded-xl object-contain" />
                ) : (
                  <div className="mx-auto grid aspect-square w-full max-w-[260px] place-items-center rounded-xl bg-black/20 px-4 text-center text-sm font-bold text-white/58">
                    {depositStatus === 'success' ? 'QR disembunyikan setelah deposit sukses' : depositStatus === 'expired' ? 'QR sudah expired' : 'QR tidak aktif'}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Total bayar</p>
                <p className="mt-1 text-2xl font-black text-white">{formatCurrency(deposit.total_bayar || deposit.amount)}</p>
                <p className="mt-1 text-xs font-semibold text-white/45">Saldo masuk {formatCurrency(deposit.amount)}</p>
                {depositPending && deposit.expired_at ? (
                  <p className="mt-2 text-xs font-bold text-amber-200">Berlaku {formatPaymentCountdown(paymentSecondsLeft)}</p>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => checkDeposit()}
                  disabled={!depositPending || checking}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff2f92] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                >
                  {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Cek Pembayaran
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  disabled={!depositPending || loading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200 disabled:opacity-50"
                >
                  Batalkan
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-black text-white">Instruksi cepat</p>
              <div className="mt-4 space-y-3 text-sm leading-6 text-white/62">
                <p>1. Pilih nominal deposit yang ingin ditambahkan.</p>
                <p>2. Backend membuat QRIS resmi melalui Premku.</p>
                <p>3. Saldo masuk hanya setelah status pembayaran sukses.</p>
              </div>
            </>
          )}
          </div>
      </div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Riwayat QRIS</p>
            <h3 className="text-lg font-extrabold text-white">Deposit saldo</h3>
          </div>
          <p className="text-xs text-white/45">Klik invoice untuk cek status atau membuka ulang QR pending.</p>
        </div>
        {depositHistory.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {depositHistory.map((item) => {
              const status = normalizeDepositUiStatus(item.status);
              const pending = status === 'pending' && !isExpiredTimestamp(item.expired_at);
              return (
                <button
                  key={item.invoice}
                  type="button"
                  onClick={() => void openDepositHistory(item.invoice)}
                  disabled={checking}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left transition hover:border-[#ff2f92]/35 hover:bg-[#ff2f92]/10 disabled:opacity-60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">Deposit {formatCurrency(item.amount)}</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-white/40">{item.invoice}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] ${paymentStatusTone(pending ? 'pending' : status)}`}>
                      {pending ? 'pending' : status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-black text-white">{formatCurrency(item.total_bayar || item.amount)}</span>
                    <span className="text-white/45">{pending ? 'Buka QR' : 'Lihat status'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 px-4 py-5 text-sm text-white/45">
            Belum ada riwayat deposit di browser ini.
          </div>
        )}
      </div>
    </Panel>
  );
}

function PromoCard() {
  return (
    <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} className="overflow-hidden rounded-2xl border border-[#ff2f92]/25 bg-[linear-gradient(135deg,rgba(255,47,146,0.18),rgba(168,85,247,0.16),rgba(0,255,153,0.08))] p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-[#ffb8dc] ring-1 ring-white/10">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-black text-white">Data realtime backend</p>
          <p className="mt-1 text-sm leading-6 text-white/62">Produk, saldo, order, dan mutasi diambil dari API Premiumin Plus.</p>
        </div>
      </div>
    </motion.div>
  );
}

function DashboardHome({ session, maintenanceActive = false }: { session: DashboardPageProps['session']; maintenanceActive?: boolean }) {
  const [data, setData] = useState<DashboardRecord>(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const normalizeProduct = (product: ProductRecord): DashboardRecord['products'][number] => ({
    product: product.name,
    price: Number(product.final_price || product.reseller_price || 0),
    stock: Number(product.stock || 0),
    sold: Number((product as ProductRecord & { sold?: number; orders?: number }).sold || (product as ProductRecord & { sold?: number; orders?: number }).orders || 0),
  });

  const buildChartData = (charts?: { deposits?: number[]; spending?: number[]; orders?: number[] }) => {
    const length = Math.max(charts?.deposits?.length || 0, charts?.spending?.length || 0, charts?.orders?.length || 0);
    if (!length) return [];
    return Array.from({ length }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (length - 1 - index));
      return {
        date: day.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        deposits: Number(charts?.deposits?.[index] || 0),
        purchases: Number(charts?.spending?.[index] || 0),
        profit: 0,
      };
    });
  };

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, products, transactions] = await Promise.all([
        premiuminApi.dashboardSummary(session.apiKey),
        premiuminApi.products(session.apiKey),
        premiuminApi.transactions(session.apiKey),
      ]);
      setData({
        saldo: summary.data.saldo || 0,
        total_deposit: summary.data.total_deposit_amount || 0,
        total_order: summary.data.total_spent || 0,
        total_transactions: summary.data.total_transactions || 0,
        total_profit: Number(summary.data.saldo_masuk || 0) - Number(summary.data.saldo_keluar || 0),
        bot_ledger: {
          total_masuk: Number(summary.data.bot_ledger?.total_masuk || 0),
          total_keluar: Number(summary.data.bot_ledger?.total_keluar || 0),
          profit: Number(summary.data.bot_ledger?.profit || 0),
        },
        chart_data: buildChartData(summary.data.charts),
        products: products.data.slice(0, 8).map(normalizeProduct),
        recent_transactions: transactions.data.slice(0, 8).map((item) => ({
          invoice: item.invoice,
          amount: Number(item.total_price || 0),
          status: item.status || item.order_status || 'pending',
          type: item.transaction_type || 'order',
          date: item.created_at || '-',
        })),
      });
      setError('');
    } catch (caught) {
      setData(emptyDashboard);
      setError(caught instanceof Error ? caught.message : 'Gagal memuat dashboard dari database.');
    } finally {
      setLoading(false);
    }
  }, [session.apiKey]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useStablePolling(loadDashboard, 60000, { immediate: false, pauseWhenHidden: true, focusThrottleMs: 30000 });

  const metrics = [
    { label: 'Saldo tersedia', value: formatCurrency(data.saldo), icon: Wallet, tone: 'bg-[#00ff99]/10 text-[#00ff99] ring-1 ring-[#00ff99]/20' },
    { label: 'Total deposit', value: formatCurrency(data.total_deposit), icon: CreditCard, tone: 'bg-[#a855f7]/10 text-[#c084fc] ring-1 ring-[#a855f7]/20' },
    { label: 'Total belanja', value: formatCurrency(data.total_order), icon: ShoppingBag, tone: 'bg-[#ff2f92]/10 text-[#ff72b9] ring-1 ring-[#ff2f92]/20' },
    { label: 'Total transaksi', value: formatNumber(data.total_transactions || 0), suffix: 'Trx', icon: ClipboardList, tone: 'bg-[#ffb020]/10 text-[#ffcf70] ring-1 ring-[#ffb020]/20' },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((item) => <MetricCard key={item.label} {...item} loading={loading} />)}
        </div>

        <Panel>
          <SectionTitle kicker="Bot API Key Ledger" title="Mutasi Bot" />
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ['Pembayaran bot', data.bot_ledger?.total_masuk || 0],
              ['Order provider', data.bot_ledger?.total_keluar || 0],
              ['Profit reseller', data.bot_ledger?.profit || 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">{label}</p>
                {loading ? <SkeletonBlock className="mt-3 h-7 w-28" /> : <p className="mt-2 text-xl font-black text-white">{formatCurrency(Number(value || 0))}</p>}
              </div>
            ))}
          </div>
        </Panel>

        {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

        <Panel>
          <SectionTitle
            kicker="Analytics"
            title="7-Day Transaction Chart"
            action={<span className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-bold text-emerald-200 sm:inline-flex">Realtime update</span>}
          />
          {loading ? <SkeletonBlock className="h-[310px] w-full" /> : data.chart_data.length ? (
            <Suspense fallback={<SkeletonBlock className="h-[310px] w-full" />}>
              <TransactionChart data={data.chart_data} />
            </Suspense>
          ) : (
            <div className="grid h-[310px] place-items-center rounded-2xl border border-white/10 bg-white/[0.035] text-sm text-white/45">
              Belum ada data chart dari database.
            </div>
          )}
        </Panel>

        <div className="grid gap-5 2xl:grid-cols-[0.95fr_1.05fr]">
          <TransactionsPanel rows={data.recent_transactions} loading={loading} />
          <ProductMiniTable products={data.products} loading={loading} />
        </div>
      </div>

      <aside className="space-y-5">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/35">Account</p>
              <h2 className="mt-1 text-xl font-black text-white">{session.username}</h2>
              <p className="mt-1 text-sm text-white/42">{session.role} mode</p>
            </div>
            <button className="relative rounded-xl border border-white/10 bg-white/[0.06] p-3 text-white/72">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#ff2f92]" />
            </button>
          </div>
        </Panel>
        <QuickActions maintenanceActive={maintenanceActive} />
        <DashboardApiKeyPanel username={session.username} apiKey={session.apiKey} maintenanceActive={maintenanceActive} compact />
        <PromoCard />
      </aside>
    </div>
  );
}

export function DashboardPage({ session, onLogout, maintenanceActive = false, maintenanceMessage = '' }: DashboardPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname === '/dashboard/' ? '/dashboard' : location.pathname;
  const visibleSections = useMemo(() => getDashboardSections(session.role), [session.role]);
  const roleLabel = String(session.role || 'reseller').toLowerCase();

  useEffect(() => {
    if (!canAccessDashboardPath(session.role, path)) navigate('/dashboard', { replace: true });
  }, [navigate, path, session.role]);

  const meta = pageMeta[path];
  const isHome = !meta || path === '/dashboard';
  const content = (() => {
    if (isHome) return <DashboardHome session={session} maintenanceActive={maintenanceActive} />;
    if (path === '/dashboard/deposit-saldo') return <DepositPage apiKey={session.apiKey} maintenanceActive={maintenanceActive} />;
    if (path === '/dashboard/api-key') return <DashboardApiKeyPanel username={session.username} apiKey={session.apiKey} maintenanceActive={maintenanceActive} />;
    if (path === '/dashboard/profit-analytics') return <ProfitAnalytics session={session} />;
    return meta.content;
  })();

  return (
    <AppShell
      title={isHome ? 'Dashboard' : meta.title}
      subtitle={isHome ? `${getGreeting()}, ${session.username}. Kelola transaksi, saldo, produk, dan API dari satu tempat.` : meta.subtitle}
      username={session.username}
      role={roleLabel}
      saldo={undefined}
      sections={visibleSections}
      onLogout={onLogout}
    >
      <div className="space-y-5">
        {maintenanceActive ? (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-5 py-4 text-amber-100">
            <p className="text-sm font-black uppercase tracking-[0.18em]">Web Sedang Maintenance</p>
            <p className="mt-2 text-sm leading-6">{maintenanceMessage || 'Web sedang maintenance. Mohon tidak melakukan transaksi terlebih dahulu. Silakan coba lagi setelah maintenance selesai.'}</p>
          </div>
        ) : null}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#ff72b9]">Premiumin Plus V3</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">{isHome ? 'Dashboard Operasional' : meta.title}</h1>
          </div>
        </div>
        {content}
      </div>
    </AppShell>
  );
}

function ProfitAnalytics({ session }: { session: DashboardPageProps['session'] }) {
  const [loading, setLoading] = useState(true);
  const [profit, setProfit] = useState(0);
  const [transactions, setTransactions] = useState(0);
  const [activeProducts, setActiveProducts] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [summary, orders] = await Promise.all([
          premiuminApi.dashboardSummary(session.apiKey),
          premiuminApi.transactions(session.apiKey),
        ]);
        if (!active) return;
        const profitAmount = summary.data.total_deposit_amount - summary.data.total_spent;
        setProfit(profitAmount);
        setTransactions(summary.data.total_transactions || orders.data.length || 0);
        setActiveProducts(summary.data.active_products || 0);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Gagal memuat profit analytics.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [session.apiKey]);

  return (
    <Panel>
      <SectionTitle kicker="Analytics" title="Profit Bersih" />
      {error ? <div className="mb-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Profit bersih" value={formatCurrency(profit)} icon={TrendingUp} tone="bg-[#00ff99]/10 text-[#00ff99] ring-1 ring-[#00ff99]/20" loading={loading} />
        <MetricCard label="Transaksi" value={formatNumber(transactions)} icon={Sparkles} tone="bg-[#ff2f92]/10 text-[#ff72b9] ring-1 ring-[#ff2f92]/20" loading={loading} />
        <MetricCard label="Produk aktif" value={formatNumber(activeProducts)} icon={Package} tone="bg-[#a855f7]/10 text-[#c084fc] ring-1 ring-[#a855f7]/20" loading={loading} />
      </div>
    </Panel>
  );
}
