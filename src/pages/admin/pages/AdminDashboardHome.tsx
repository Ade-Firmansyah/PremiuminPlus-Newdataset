import { useEffect, useState } from 'react';
import { Activity, Banknote, Clock, PlugZap, ReceiptText, TrendingUp, Users, WalletCards } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { formatCurrency, formatNumber } from '../../../utils/format';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type AdminSummaryRecord, type PremkuProfileRecord } from '../../../services/api';

const emptySummary: AdminSummaryRecord = {
  total_users: 0,
  active_resellers: 0,
  total_reseller_balance: 0,
  total_transactions: 0,
  total_revenue: 0,
  system_profit: 0,
  pending_withdraw_count: 0,
  pending_withdraw: 0,
};

export function AdminDashboardHome() {
  const [summary, setSummary] = useState<AdminSummaryRecord>(emptySummary);
  const [premkuProfile, setPremkuProfile] = useState<PremkuProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const apiKey = getApiKey();

  useEffect(() => {
    let active = true;
    const load = async (quiet = false) => {
      if (!quiet) setLoading(true);
      setError('');
      try {
        const [summaryResponse, premkuResponse] = await Promise.all([
          premiuminApi.adminSummary(apiKey || undefined),
          premiuminApi.adminPremkuProfile(apiKey || undefined),
        ]);
        if (!active) return;
        setSummary(summaryResponse.data);
        setPremkuProfile(premkuResponse.data);
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Gagal memuat ringkasan admin.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(true), 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [apiKey]);

  const cards = [
    { label: 'Total Users', value: formatNumber(summary.total_users), icon: Users, hint: `${formatNumber(summary.active_resellers)} reseller aktif` },
    { label: 'Revenue', value: formatCurrency(summary.total_revenue), icon: TrendingUp, hint: 'Transaksi processing dan success' },
    { label: 'Profit System', value: formatCurrency(summary.system_profit), icon: ReceiptText, hint: `${formatNumber(summary.total_transactions)} transaksi` },
    { label: 'Saldo Reseller', value: formatCurrency(summary.total_reseller_balance), icon: WalletCards, hint: 'Liabilitas saldo aktif' },
    { label: 'Pending WD', value: formatCurrency(summary.pending_withdraw), icon: Banknote, hint: `${formatNumber(summary.pending_withdraw_count)} tiket menunggu` },
    { label: 'System Health', value: loading ? 'Loading' : 'Online', icon: Activity, hint: 'Backend dan MySQL aktif' },
  ];

  return (
    <div className="space-y-4">
      <PageHero
        title="Admin Dashboard"
        subtitle="Pusat kendali bisnis reseller, finance, user, margin, dan operasional."
        slogan="Semua angka penting tampil ringkas agar keputusan admin bisa cepat dan jelas."
        tone="from-brand/15 via-sky-500/10 to-emerald-500/10"
        chips={['Revenue', 'Withdraw', 'Reseller balance']}
      />

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <NeonCard key={card.label}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{card.label}</p>
                  <p className="mt-2 text-2xl font-black text-white">{card.value}</p>
                  <p className="mt-2 text-sm text-white/45">{card.hint}</p>
                </div>
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/20">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </NeonCard>
          );
        })}
      </section>

      <PageSection title="Saldo API Premku" subtitle="Realtime jika provider mendukung">
        <div className="grid gap-4 md:grid-cols-3">
          <NeonCard>
            <PlugZap className="h-5 w-5 text-brand" />
            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Status API</p>
            <p className="mt-2 text-xl font-black text-white">{premkuProfile?.available ? 'Available' : 'Unavailable'}</p>
            <p className="mt-2 text-sm text-white/45">{premkuProfile?.message || 'Profile endpoint Premku dicek langsung dari backend.'}</p>
          </NeonCard>
          <NeonCard>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Saldo asli Premku</p>
            <p className="mt-2 text-2xl font-black text-white">
              {premkuProfile?.available && premkuProfile.saldo !== null && premkuProfile.saldo !== undefined
                ? formatCurrency(premkuProfile.saldo)
                : 'Realtime unavailable'}
            </p>
          </NeonCard>
          <NeonCard>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Identitas API</p>
            <p className="mt-2 text-lg font-black text-white">{premkuProfile?.username || '-'}</p>
            <p className="mt-1 text-sm text-white/45">{premkuProfile?.whatsapp || '-'}</p>
          </NeonCard>
        </div>
      </PageSection>

      <PageSection title="Audit Operasional" subtitle="Standar produksi">
        <div className="grid gap-3 md:grid-cols-3">
          {['Saldo tidak boleh minus', 'WD diproses manual admin', 'Bot settings siap integrasi'].map((item) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-[#0f172a] px-4 py-3 text-sm font-semibold text-white/75">
              {item}
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection title="Realtime Monitoring" subtitle="Polling ringan setiap 10 detik">
        <div className="grid gap-4 lg:grid-cols-3">
          <NeonCard>
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <Clock className="h-4 w-4 text-brand" />
              Recent Orders
            </div>
            <div className="mt-3 space-y-2">
              {(summary.recent_orders || []).map((item) => (
                <div key={item.invoice} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-sm font-bold text-white">{item.product_name || item.invoice}</p>
                  <p className="mt-1 text-xs text-white/45">{formatCurrency(item.total_price || 0)} | {item.status}</p>
                </div>
              ))}
              {!summary.recent_orders?.length ? <p className="text-sm text-white/45">Belum ada order terbaru.</p> : null}
            </div>
          </NeonCard>
          <NeonCard>
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <Clock className="h-4 w-4 text-brand" />
              Pending Payments
            </div>
            <div className="mt-3 space-y-2">
              {(summary.pending_payments || []).map((item) => (
                <div key={item.invoice} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-sm font-bold text-white">{item.invoice}</p>
                  <p className="mt-1 text-xs text-white/45">{formatCurrency(item.total_bayar || item.amount)} | {item.status}</p>
                </div>
              ))}
              {!summary.pending_payments?.length ? <p className="text-sm text-white/45">Tidak ada payment pending.</p> : null}
            </div>
          </NeonCard>
          <NeonCard>
            <div className="flex items-center gap-2 text-sm font-black text-white">
              <Users className="h-4 w-4 text-brand" />
              Recent Users
            </div>
            <div className="mt-3 space-y-2">
              {(summary.recent_users || []).map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-sm font-bold text-white">{item.username}</p>
                  <p className="mt-1 text-xs text-white/45">{item.role} | {item.status}</p>
                </div>
              ))}
              {!summary.recent_users?.length ? <p className="text-sm text-white/45">Belum ada user baru.</p> : null}
            </div>
          </NeonCard>
        </div>
      </PageSection>
    </div>
  );
}
