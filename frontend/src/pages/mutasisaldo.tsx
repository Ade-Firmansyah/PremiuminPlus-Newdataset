import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, BadgeDollarSign, ListFilter, TrendingUp, WalletCards } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from './dashboardPageKit';
import { formatCurrency } from '../utils/format';
import { premiuminApi, type SaldoLogRecord, type SaldoLogsSummaryRecord } from '../services/api';
import { getApiKey } from '../store/useAuth';

type FilterKey = 'all' | 'in' | 'out' | 'profit';

function resolveDirection(item: SaldoLogRecord): 'in' | 'out' | 'profit' {
  if (item.direction) return item.direction;
  if (['profit_income', 'bot_profit'].includes(String(item.mutation_type))) return 'profit';
  if (['provider_purchase', 'order', 'withdraw', 'bot_activation'].includes(String(item.mutation_type))) return 'out';
  if (['deposit', 'payment_in', 'refund'].includes(String(item.mutation_type))) return 'in';
  if (item.type === 'debit') return 'out';
  return Number(item.balance_after || 0) >= Number(item.balance_before || 0) ? 'in' : 'out';
}

function mutationLabel(item: SaldoLogRecord) {
  const type = String(item.mutation_type || item.type || '').toLowerCase();
  if (type === 'payment_in') return 'Masuk';
  if (type === 'deposit') return 'Masuk';
  if (type === 'provider_purchase') return 'Keluar';
  if (type === 'order') return 'Keluar';
  if (type === 'withdraw') return 'Keluar';
  if (['profit_income', 'bot_profit'].includes(type)) return 'Profit';
  if (type === 'refund') return 'Masuk';
  return resolveDirection(item) === 'out' ? 'Keluar' : resolveDirection(item) === 'profit' ? 'Profit' : 'Masuk';
}

function mutationTitle(item: SaldoLogRecord) {
  const type = String(item.mutation_type || item.type || '').toLowerCase();
  const reference = item.reference ? `ID: ${item.reference}` : '';
  if (type === 'payment_in') return `Saldo masuk dari pembayaran customer ${reference}`.trim();
  if (type === 'deposit') return `Deposit saldo ${reference}`.trim();
  if (type === 'provider_purchase') return `Modal provider / pembelian produk ${reference}`.trim();
  if (type === 'order') return `Order produk ${reference}`.trim();
  if (type === 'withdraw') return `Request withdraw ${reference}`.trim();
  if (['profit_income', 'bot_profit'].includes(type)) return `Pendapatan margin bot ${reference}`.trim();
  if (type === 'refund') return `Refund saldo ${reference}`.trim();
  return item.notes || item.reference || 'Mutasi saldo';
}

function mutationDescription(item: SaldoLogRecord) {
  return item.notes || mutationTitle(item);
}

function formatDateTime(value?: string) {
  if (!value) return { date: '-', time: '-' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: String(value), time: '' };
  return {
    date: date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: `${date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB`,
  };
}

function badgeClass(direction: ReturnType<typeof resolveDirection>) {
  if (direction === 'profit') return 'border-sky-400/25 bg-sky-500/10 text-sky-200';
  if (direction === 'in') return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200';
  return 'border-rose-400/25 bg-rose-500/10 text-rose-200';
}

function amountClass(direction: ReturnType<typeof resolveDirection>) {
  if (direction === 'profit') return 'text-sky-300';
  if (direction === 'in') return 'text-emerald-300';
  return 'text-rose-300';
}

function amountPrefix(direction: ReturnType<typeof resolveDirection>) {
  return direction === 'out' ? '-' : '+';
}

export default function MutasiSaldo() {
  const [logs, setLogs] = useState<SaldoLogRecord[]>([]);
  const [summary, setSummary] = useState<SaldoLogsSummaryRecord | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const apiKey = getApiKey();

  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await premiuminApi.saldoLogs(apiKey || undefined);
        setLogs(response.data);
        setSummary(response.summary || null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Gagal memuat mutasi saldo.');
      } finally {
        setLoading(false);
      }
    };

    void loadLogs();
  }, [apiKey]);

  const computedSummary = useMemo(() => {
    if (summary) return summary;
    return logs.reduce(
      (acc, item) => {
        const direction = resolveDirection(item);
        if (direction === 'in') acc.total_in += Number(item.amount || 0);
        if (direction === 'out') acc.total_out += Number(item.amount || 0);
        if (direction === 'profit') acc.total_profit += Number(item.amount || 0);
        return acc;
      },
      { total_in: 0, total_out: 0, total_profit: 0 },
    );
  }, [logs, summary]);

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return logs;
    return logs.filter((item) => resolveDirection(item) === filter);
  }, [filter, logs]);

  const cards = [
    {
      label: 'Total Uang Masuk',
      value: computedSummary.total_in,
      icon: ArrowDownLeft,
      prefix: '+',
      tone: 'border-emerald-400/20 from-emerald-500/12 to-white/[0.04] text-emerald-300',
    },
    {
      label: 'Total Uang Keluar',
      value: computedSummary.total_out,
      icon: ArrowUpRight,
      prefix: '-',
      tone: 'border-rose-400/20 from-rose-500/12 to-white/[0.04] text-rose-300',
    },
    {
      label: 'Pendapatan Margin',
      value: computedSummary.total_profit,
      icon: BadgeDollarSign,
      prefix: '+',
      tone: 'border-sky-400/20 from-sky-500/12 to-white/[0.04] text-sky-300',
    },
  ];

  return (
    <div className="mutasi-saldo space-y-4">
      <PageHero
        title="Mutasi Saldo"
        subtitle="Lacak pemasukan, pengeluaran, dan margin pendapatan member/reseller."
        slogan="Semua angka berasal dari saldo mutation backend agar tidak mismatch dengan wallet."
        tone="from-brand/15 via-violet-500/10 to-sky-500/10"
        chips={['Uang masuk', 'Uang keluar', 'Margin profit']}
      />

      <section className="grid gap-4 lg:grid-cols-3">
        {cards.map((item) => {
          const Icon = item.icon;
          return (
            <NeonCard key={item.label} className={`border bg-gradient-to-br ${item.tone}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/40">{item.label}</p>
                  <p className={`mt-3 text-3xl font-black tracking-tight text-white`}>
                    <span className={item.tone.includes('emerald') ? 'text-emerald-300' : item.tone.includes('rose') ? 'text-rose-300' : 'text-sky-300'}>{item.prefix}</span>
                    {formatCurrency(item.value).replace('Rp', 'Rp')}
                  </p>
                </div>
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border bg-black/20 ${item.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </NeonCard>
          );
        })}
      </section>

      <PageSection title="Detail Mutasi" subtitle="Riwayat pemasukan, modal provider, withdraw, dan profit">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="inline-flex items-center gap-2 text-sm font-black text-white">
            <ListFilter className="h-4 w-4 text-brand-light" />
            Detail Mutasi
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ['all', 'Semua'],
              ['in', 'Pemasukan'],
              ['out', 'Pengeluaran'],
              ['profit', 'Pendapatan'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key as FilterKey)}
                className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${
                  filter === key ? 'border-brand/40 bg-brand/15 text-white' : 'border-white/10 bg-white/5 text-white/55 hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? <p className="mt-4 text-sm text-white/45">Memuat mutasi saldo...</p> : null}
        {error ? <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

        <div className="mt-4 hidden overflow-hidden rounded-[1.2rem] border border-white/10 md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-[#0f0b15] text-[10px] font-black uppercase tracking-[0.2em] text-white/42">
                <tr>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Tipe</th>
                  <th className="px-4 py-3">Keterangan</th>
                  <th className="px-4 py-3 text-right">Nominal</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((item) => {
                  const direction = resolveDirection(item);
                  const when = formatDateTime(item.created_at);
                  return (
                    <tr key={`${item.id}-${item.mutation_type || item.type}`} className="border-t border-white/10 transition hover:bg-white/[0.03]">
                      <td className="px-4 py-3 align-top">
                        <p className="font-bold text-white">{when.date}</p>
                        <p className="mt-1 text-[11px] text-white/42">{when.time}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] ${badgeClass(direction)}`}>
                          {mutationLabel(item)}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-white">{mutationDescription(item)}</p>
                        <p className="mt-1 text-xs text-white/42">{item.reference || mutationTitle(item)}</p>
                      </td>
                      <td className={`px-4 py-3 text-right align-top text-base font-black ${amountClass(direction)}`}>
                        {amountPrefix(direction)} {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:hidden">
          {filteredLogs.map((item) => {
            const direction = resolveDirection(item);
            const when = formatDateTime(item.created_at);
            return (
              <NeonCard key={`${item.id}-${item.mutation_type || item.type}`} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className={`inline-flex rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] ${badgeClass(direction)}`}>
                      {mutationLabel(item)}
                    </span>
                    <p className="mt-3 line-clamp-2 font-bold text-white">{mutationDescription(item)}</p>
                    <p className="mt-1 text-xs text-white/45">{when.date} - {when.time}</p>
                  </div>
                  <p className={`shrink-0 text-right text-sm font-black ${amountClass(direction)}`}>
                    {amountPrefix(direction)} {formatCurrency(item.amount)}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/45">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <p>Saldo Awal</p>
                    <p className="mt-1 font-bold text-white">{formatCurrency(item.balance_before)}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    <p>Saldo Akhir</p>
                    <p className="mt-1 font-bold text-white">{formatCurrency(item.balance_after)}</p>
                  </div>
                </div>
              </NeonCard>
            );
          })}
        </div>

        {!loading && !filteredLogs.length && !error ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-white/50">
            <WalletCards className="mx-auto mb-3 h-8 w-8 text-white/30" />
            Belum ada mutasi saldo untuk filter ini.
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-sky-400/15 bg-sky-500/8 px-4 py-3 text-xs leading-6 text-sky-100/78">
          <span className="inline-flex items-center gap-2 font-black text-white">
            <TrendingUp className="h-4 w-4 text-sky-300" />
            Formula saldo bot:
          </span>{' '}
          pembayaran customer masuk ke wallet, modal provider keluar, dan selisih markup dicatat sebagai pendapatan margin.
        </div>
      </PageSection>
    </div>
  );
}
