import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, WalletCards } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from './dashboardPageKit';
import { formatCurrency } from '../utils/format';
import { premiuminApi, type SaldoLogRecord } from '../services/api';
import { getApiKey } from '../store/useAuth';

function isIncoming(item: SaldoLogRecord) {
  if (item.type === 'debit') return false;
  if (['credit', 'refund'].includes(item.type)) return true;
  return Number(item.balance_after || 0) >= Number(item.balance_before || 0);
}

function mutationTitle(item: SaldoLogRecord) {
  const notes = String(item.notes || '').toLowerCase();
  if (item.type === 'credit' && (notes.includes('deposit') || notes.includes('qris'))) return 'QRIS Payment';
  if (item.type === 'debit') return `Order ${item.reference || 'Produk'}`;
  if (item.type === 'refund') return `Refund ${item.reference || 'Saldo'}`;
  return item.reference || 'Mutasi Saldo';
}

export default function MutasiSaldo() {
  const [logs, setLogs] = useState<SaldoLogRecord[]>([]);
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
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Gagal memuat mutasi saldo.');
      } finally {
        setLoading(false);
      }
    };

    void loadLogs();
  }, [apiKey]);

  const summary = useMemo(() => {
    const credit = logs.filter(isIncoming).reduce((sum, item) => sum + item.amount, 0);
    const debit = logs.filter((item) => !isIncoming(item)).reduce((sum, item) => sum + item.amount, 0);
    const lastBalance = logs[0]?.balance_after || 0;
    return [
      { label: 'Total Uang Masuk', value: credit, icon: ArrowUpRight, tone: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/20' },
      { label: 'Total Uang Keluar', value: debit, icon: ArrowDownRight, tone: 'text-rose-300 bg-rose-500/10 ring-rose-500/20' },
      { label: 'Saldo Akhir Log', value: lastBalance, icon: WalletCards, tone: 'text-brand bg-brand/10 ring-brand/20' },
    ];
  }, [logs]);

  return (
    <div className="mutasi-saldo">
      <PageHero
        title="Mutasi Saldo"
        subtitle="Semua pergerakan saldo berasal dari wallet service."
        slogan="QRIS masuk dan order keluar tercatat di mutasi saldo."
        tone="from-brand/15 via-violet-500/10 to-sky-500/10"
        chips={['Wallet logs', 'DB sync', 'Anti mismatch']}
      />
      <div className="mt-4">
        <PageSection title="Pergerakan saldo" subtitle="Pergerakan saldo dan jejak transaksi">
          <div className="grid gap-4 md:grid-cols-3">
            {summary.map((item) => {
              const Icon = item.icon;
              return (
                <NeonCard key={item.label}>
                  <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${item.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{item.label}</p>
                  <p className="mt-2 text-2xl font-black tracking-tight text-white">{formatCurrency(item.value)}</p>
                </NeonCard>
              );
            })}
          </div>

          {loading ? <p className="mt-4 text-sm text-white/45">Memuat mutasi saldo...</p> : null}
          {error ? <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

          <div className="mt-4 space-y-3">
            {logs.map((item) => (
              <NeonCard key={item.id}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                      isIncoming(item) ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border border-rose-500/20 bg-rose-500/10 text-rose-300'
                    }`}>
                      {isIncoming(item) ? 'Masuk' : 'Keluar'}
                    </span>
                    <h4 className="mt-3 text-base font-bold text-white">{mutationTitle(item)}</h4>
                    <p className="mt-1 text-sm text-white/45">{item.notes || 'Pergerakan saldo'} | {item.created_at || '-'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-extrabold text-white">
                      {isIncoming(item) ? '+' : '-'}
                      {formatCurrency(item.amount)}
                    </p>
                    <p className="mt-1 text-xs text-white/45">Saldo akhir {formatCurrency(item.balance_after)}</p>
                  </div>
                </div>
              </NeonCard>
            ))}
          </div>

          {!loading && !logs.length && !error ? <p className="mt-4 text-sm text-white/45">Belum ada mutasi saldo.</p> : null}
        </PageSection>
      </div>
    </div>
  );
}
