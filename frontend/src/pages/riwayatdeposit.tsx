import { useEffect, useState } from 'react';
import { PageHero, PageSection } from './dashboardPageKit';
import { premiuminApi, type DepositRecord } from '../services/api';
import { getApiKey } from '../store/useAuth';
import { formatCurrency } from '../utils/format';

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
        slogan="Saldo hanya masuk saat status pembayaran success."
        tone="from-emerald-500/15 via-sky-500/10 to-cyan-500/10"
        chips={['Top up', 'DB sync', 'Saldo real']}
      />
      <div className="mt-4">
        <PageSection title="Daftar deposit" subtitle="History deposit saldo">
          {loading ? <p className="text-sm text-white/45">Memuat riwayat deposit...</p> : null}
          {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
          <div className="space-y-3">
            {deposits.map((deposit) => (
              <div key={deposit.invoice} className="flex flex-col justify-between gap-3 rounded-[1.2rem] border border-white/10 bg-[#0f0b15] px-4 py-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-white">{deposit.invoice}</p>
                  <p className="mt-1 text-xs text-white/40">{deposit.created_at || '-'}</p>
                  {deposit.qr_data ? <p className="mt-2 max-w-xl break-all text-xs text-white/45">QR: {deposit.qr_data}</p> : null}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-white">{formatCurrency(deposit.total_bayar || deposit.amount)}</p>
                  <span className="mt-1 inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                    {deposit.status || 'pending'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {!loading && !deposits.length && !error ? <p className="text-sm text-white/45">Belum ada deposit.</p> : null}
        </PageSection>
      </div>
    </div>
  );
}
