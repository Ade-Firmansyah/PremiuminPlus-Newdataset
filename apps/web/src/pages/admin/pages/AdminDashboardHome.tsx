import { useCallback, useState } from 'react';
import { Activity, ArrowDownToLine, ArrowUpFromLine, Banknote, Clock, PlugZap, ReceiptText, TrendingUp, Users, WalletCards } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { formatCurrency, formatNumber } from '../../../utils/format';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type AdminSummaryRecord, type PremkuProfileRecord } from '../../../services/api';
import { useStablePolling } from '../../../hooks/useStablePolling';

const emptySummary: AdminSummaryRecord = {
  total_users: 0,
  active_resellers: 0,
  total_reseller_balance: 0,
  total_transactions: 0,
  total_revenue: 0,
  system_profit: 0,
  pending_withdraw_count: 0,
  pending_withdraw: 0,
  b2b_ledger: {
    total_bot_orders: 0,
    revenue_reseller: 0,
    provider_cost: 0,
    profit_admin: 0,
    profit_reseller: 0,
  },
  finance_activity: {
    order_count: 0,
    order_revenue: 0,
    provider_cost: 0,
    order_profit: 0,
    deposit_count: 0,
    deposit_amount: 0,
    withdraw_count: 0,
    withdraw_amount: 0,
    wallet_in: 0,
    wallet_out: 0,
    net_wallet_movement: 0,
    mutation_count: 0,
    ledger_sync: {
      account_count: 0,
      synced_count: 0,
      mismatch_count: 0,
      mismatch_amount: 0,
    },
  },
};

export function AdminDashboardHome({ apiKey: sessionApiKey }: { apiKey?: string } = {}) {
  const [summary, setSummary] = useState<AdminSummaryRecord>(emptySummary);
  const [premkuProfile, setPremkuProfile] = useState<PremkuProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const apiKey = sessionApiKey || getApiKey();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [summaryResponse, premkuResponse] = await Promise.all([
        premiuminApi.adminSummary(apiKey || undefined),
        premiuminApi.adminPremkuProfile(apiKey || undefined),
      ]);
      setSummary(summaryResponse.data);
      setPremkuProfile(premkuResponse.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat ringkasan admin.');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useStablePolling(() => load(true), 60000, { immediate: true, pauseWhenHidden: true, focusThrottleMs: 30000 });

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

      <PageSection title="Finance Monitoring" subtitle="Order, deposit, withdraw, dan pergerakan wallet dari sumber transaksi yang sama">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[
            ['Revenue Order', summary.finance_activity?.order_revenue || 0, `${formatNumber(summary.finance_activity?.order_count || 0)} order`],
            ['Provider Cost', summary.finance_activity?.provider_cost || 0, 'Modal produk tercatat'],
            ['Profit Order', summary.finance_activity?.order_profit || 0, 'Revenue dikurangi provider cost'],
            ['Deposit Masuk', summary.finance_activity?.deposit_amount || 0, `${formatNumber(summary.finance_activity?.deposit_count || 0)} deposit sukses`],
            ['Withdraw Keluar', summary.finance_activity?.withdraw_amount || 0, `${formatNumber(summary.finance_activity?.withdraw_count || 0)} withdraw approved`],
            ['Net Wallet', summary.finance_activity?.net_wallet_movement || 0, `${formatNumber(summary.finance_activity?.mutation_count || 0)} mutasi tercatat`],
          ].map(([label, value, hint]) => (
            <NeonCard key={String(label)}>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{label}</p>
              <p className="mt-2 text-2xl font-black text-white">{formatCurrency(Number(value || 0))}</p>
              <p className="mt-2 text-sm text-white/45">{hint}</p>
            </NeonCard>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-white/10 bg-black/20 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
            <span>Aktivitas terbaru</span>
            <span>Nominal</span>
          </div>
          <div className="divide-y divide-white/10">
            {(summary.recent_finance_events || []).map((event) => {
              const DirectionIcon = event.direction === 'in' ? ArrowDownToLine : event.direction === 'out' ? ArrowUpFromLine : Activity;
              const amountClass = event.direction === 'in' ? 'text-emerald-200' : event.direction === 'out' ? 'text-rose-200' : 'text-white/70';
              return (
                <div key={event.event_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5">
                      <DirectionIcon className={`h-4 w-4 ${amountClass}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{event.title || event.event_type}</p>
                      <p className="mt-1 truncate text-xs text-white/40">
                        {[event.username, event.reference, event.status].filter(Boolean).join(' | ')}
                      </p>
                    </div>
                  </div>
                  <p className={`text-sm font-black ${amountClass}`}>{formatCurrency(Number(event.amount || 0))}</p>
                </div>
              );
            })}
            {!summary.recent_finance_events?.length ? (
              <p className="px-4 py-6 text-center text-sm text-white/45">Belum ada aktivitas finance.</p>
            ) : null}
          </div>
        </div>

        <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
          (summary.finance_activity?.ledger_sync?.mismatch_count || 0) > 0
            ? 'border-amber-400/25 bg-amber-400/10'
            : 'border-emerald-400/20 bg-emerald-400/10'
        }`}>
          <div>
            <p className="text-sm font-black text-white">Audit sinkronisasi saldo</p>
            <p className="mt-1 text-xs text-white/50">Saldo user dibandingkan dengan saldo akhir ledger terbaru.</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-black text-white">
              {formatNumber(summary.finance_activity?.ledger_sync?.synced_count || 0)} / {formatNumber(summary.finance_activity?.ledger_sync?.account_count || 0)} akun sinkron
            </p>
            <p className="mt-1 text-xs text-white/50">
              Selisih {formatCurrency(summary.finance_activity?.ledger_sync?.mismatch_amount || 0)}
            </p>
          </div>
        </div>
      </PageSection>

      <PageSection title="B2B Bot Ledger" subtitle="Ringkasan transaksi bot berdasarkan ledger Premiumin Plus">
        <div className="grid gap-3 md:grid-cols-5">
          {[
            ['Order Bot', summary.b2b_ledger?.total_bot_orders || 0, 'number'],
            ['Revenue Reseller', summary.b2b_ledger?.revenue_reseller || 0, 'currency'],
            ['Provider Cost', summary.b2b_ledger?.provider_cost || 0, 'currency'],
            ['Profit Admin', summary.b2b_ledger?.profit_admin || 0, 'currency'],
            ['Profit Reseller', summary.b2b_ledger?.profit_reseller || 0, 'currency'],
          ].map(([label, value, type]) => (
            <NeonCard key={String(label)}>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{label}</p>
              <p className="mt-2 text-2xl font-black text-white">
                {type === 'currency' ? formatCurrency(Number(value || 0)) : formatNumber(Number(value || 0))}
              </p>
            </NeonCard>
          ))}
        </div>
      </PageSection>

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

      <PageSection title="Data Card Produksi" subtitle="Ringkasan operasional dari backend lokal">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ['Order Web', summary.operational?.web_orders || 0],
            ['Order Bot', summary.operational?.bot_orders || 0],
            ['Order Manual', summary.operational?.manual_orders || 0],
            ['Deposit Success', summary.operational?.successful_deposits || 0],
            ['User Baru 7 Hari', summary.operational?.new_users_7d || 0],
            ['Mutasi 7 Hari', summary.operational?.balance_mutations_7d || 0],
            ['Pending Provider', summary.operational?.pending_provider || 0],
            ['Manual Required', summary.operational?.manual_required || 0],
          ].map(([label, value]) => (
            <NeonCard key={String(label)}>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{label}</p>
              <p className="mt-2 text-2xl font-black text-white">{formatNumber(Number(value || 0))}</p>
            </NeonCard>
          ))}
        </div>
      </PageSection>

      <PageSection title="Realtime Monitoring" subtitle="Refresh ringan maksimal setiap 60 detik saat halaman aktif">
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
