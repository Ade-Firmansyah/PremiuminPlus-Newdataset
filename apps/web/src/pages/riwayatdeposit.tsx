import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, ReceiptText, WalletCards, XCircle } from 'lucide-react';
import { PageHero, PageSection } from './dashboardPageKit';
import { premiuminApi, type DepositRecord } from '../services/api';
import { getApiKey } from '../store/useAuth';
import { formatCurrency } from '../utils/format';

function statusTone(status?: string) {
  const value = String(status || 'pending').toLowerCase();
  if (value === 'success') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
  if (value === 'failed') return 'border-rose-500/20 bg-rose-500/10 text-rose-300';
  if (value === 'expired' || value === 'canceled') return 'border-white/10 bg-white/5 text-white/45';
  return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
}

function statusIcon(status?: string) {
  const value = String(status || 'pending').toLowerCase();
  if (value === 'success') return CheckCircle2;
  if (value === 'failed' || value === 'expired' || value === 'canceled') return XCircle;
  return Clock3;
}

export default function RiwayatDeposit() {
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const apiKey = getApiKey();

  useEffect(() => {
    const loadDeposits = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await premiuminApi.deposits(apiKey || undefined);
        setDeposits(response.data);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Gagal memuat riwayat deposit.');
      } finally {
        setLoading(false);
      }
    };

    void loadDeposits();
  }, [apiKey]);

  return (
    <div className="riwayat-deposit">
      <PageHero
        title="Riwayat Deposit"
        subtitle="Riwayat top up langsung dari tabel deposit backend."
        slogan="Data deposit dipisahkan dari riwayat pesanan agar alur saldo tetap jelas."
        tone="from-emerald-500/15 via-sky-500/10 to-cyan-500/10"
        chips={['Top up', 'Invoice', 'Status saldo']}
      />
      <div className="mt-4">
        <PageSection title="Daftar deposit" subtitle="History deposit saldo">
          {loading ? <p className="text-sm text-white/45">Memuat riwayat deposit...</p> : null}
          {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

          <div className="grid gap-3">
            {deposits.map((deposit) => {
              const StatusIcon = statusIcon(deposit.status);
              return (
                <article key={deposit.invoice} className="grid gap-3 rounded-[1.1rem] border border-white/10 bg-[#0f0b15] p-3 sm:grid-cols-[56px_1fr_auto] sm:items-center">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                    <WalletCards className="h-6 w-6" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black text-white">Deposit Saldo</p>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${statusTone(deposit.status)}`}>
                        <StatusIcon className="h-3 w-3" />
                        {deposit.status || 'pending'}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/45">
                      <ReceiptText className="h-3.5 w-3.5 text-white/30" />
                      <span className="font-semibold text-white/65">{deposit.invoice}</span>
                      <span>{deposit.created_at || '-'}</span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Nominal</p>
                    <p className="mt-1 text-base font-black text-white">{formatCurrency(deposit.amount)}</p>
                    {deposit.total_bayar && deposit.total_bayar !== deposit.amount ? (
                      <p className="mt-1 text-[11px] font-semibold text-white/45">QRIS {formatCurrency(deposit.total_bayar)}</p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          {!loading && !deposits.length && !error ? <p className="text-sm text-white/45">Belum ada deposit.</p> : null}
        </PageSection>
      </div>
    </div>
  );
}
