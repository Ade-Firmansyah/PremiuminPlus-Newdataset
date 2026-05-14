import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Coins, CreditCard, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from './dashboardPageKit';
import { formatCurrency } from '../utils/format';
import { getApiKey } from '../store/useAuth';
import { premiuminApi, type DashboardSummaryRecord, type MeRecord } from '../services/api';

export default function Profil() {
  const [user, setUser] = useState<MeRecord | null>(null);
  const [summary, setSummary] = useState<DashboardSummaryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const apiKey = getApiKey();

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setError('');

      try {
        const [meResponse, summaryResponse] = await Promise.all([
          premiuminApi.me(apiKey || undefined),
          premiuminApi.dashboardSummary(apiKey || undefined),
        ]);
        setUser(meResponse.data);
        setSummary(summaryResponse.data);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Gagal memuat profil.');
      } finally {
        setLoading(false);
      }
    };

    void loadProfile();
  }, [apiKey]);

  const metrics = useMemo(
    () => [
      { label: 'Saldo Aktif', value: user?.saldo || 0, icon: Wallet, tone: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/20' },
      { label: 'Total Transaksi', value: summary?.total_transactions || 0, icon: BadgeCheck, tone: 'text-sky-300 bg-sky-500/10 ring-sky-500/20' },
      { label: 'Total Deposit', value: summary?.total_deposit_amount || 0, icon: Coins, tone: 'text-brand bg-brand/10 ring-brand/20' },
      { label: 'Total Belanja', value: summary?.total_spent || 0, icon: CreditCard, tone: 'text-amber-300 bg-amber-500/10 ring-amber-500/20' },
    ],
    [summary, user],
  );

  const accountDetails = [
    { label: 'Username', value: user?.username || '-' },
    { label: 'Email', value: user?.email || '-' },
    { label: 'Saldo', value: formatCurrency(user?.saldo || 0) },
    { label: 'Role', value: user?.role || '-' },
    { label: 'API Key', value: user?.api_key ? `${user.api_key.slice(0, 8)}...${user.api_key.slice(-4)}` : '-' },
  ];

  return (
    <div className="profil">
      <PageHero
        title="Profil"
        subtitle="Profil dibuat seperti dashboard mini berisi data inti akun."
        slogan="Saldo, transaksi, dan aktivitas terakhir tampil dalam satu napas."
        tone="from-fuchsia-500/15 via-brand/10 to-sky-500/10"
        chips={['Data akun', 'Ringkasan performa', 'Aktivitas terbaru']}
      />
      <div className="mt-4">
      <PageSection title="Ringkasan akun" subtitle="Ringkasan akun dan aktivitas">
        {loading ? <p className="mb-3 text-sm text-white/45">Memuat profil dari database...</p> : null}
        {error ? <div className="mb-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
        <div className="mb-4 rounded-[1.4rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,0,127,0.12),rgba(14,165,233,0.10))] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/45">Sub data akun</p>
          <h3 className="mt-2 text-2xl font-extrabold text-white">{user?.username || 'Akun'} tersinkron dengan database.</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">
            Saldo, role, email, transaksi, dan deposit di halaman ini berasal dari API backend.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((item) => {
            const Icon = item.icon;
            return (
              <NeonCard key={item.label}>
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${item.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{item.label}</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-white">
                  {item.label.includes('Saldo') || item.label.includes('Deposit') || item.label.includes('Belanja') ? formatCurrency(item.value) : item.value}
                </p>
              </NeonCard>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <NeonCard>
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <p className="text-sm font-semibold text-white">Detail akun</p>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {accountDetails.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{item.label}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </NeonCard>
        </div>

        <div className="mt-4 rounded-[1.4rem] border border-brand/20 bg-[linear-gradient(145deg,rgba(255,0,127,0.10),rgba(255,255,255,0.03))] p-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-brand-light" />
            <p className="text-sm font-semibold text-white">Ringkasan cepat</p>
          </div>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Dashboard dan profil memakai endpoint user yang sama, jadi saldo tidak lagi bercabang antar halaman.
          </p>
        </div>
      </PageSection>
      </div>
    </div>
  );
}
