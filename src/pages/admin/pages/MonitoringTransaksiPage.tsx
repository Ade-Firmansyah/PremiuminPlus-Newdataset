import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, CheckCircle2, ListFilter, ReceiptText, RefreshCcw, XCircle } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { formatCurrency } from '../../../utils/format';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type DepositRecord, type OrderRecord, type WithdrawRecord } from '../../../services/api';

type TabKey = 'topup' | 'order' | 'withdraw';

export function MonitoringTransaksiPage() {
  const [tab, setTab] = useState<TabKey>('topup');
  const [topups, setTopups] = useState<DepositRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [withdraws, setWithdraws] = useState<WithdrawRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const apiKey = getApiKey();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [depositResponse, orderResponse, withdrawResponse] = await Promise.all([
        premiuminApi.adminDeposits(apiKey || undefined),
        premiuminApi.adminTransactions(apiKey || undefined),
        premiuminApi.adminWithdraws(apiKey || undefined),
      ]);
      setTopups(depositResponse.data);
      setOrders(orderResponse.data);
      setWithdraws(withdrawResponse.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat transaksi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [apiKey]);

  const topUpTotal = useMemo(
    () =>
      topups
        .filter((item) => ['success', 'sukses', 'paid'].includes(String(item.status || '').toLowerCase()))
        .reduce((sum, item) => sum + (item.total_bayar || item.amount || 0), 0),
    [topups],
  );
  const orderTotal = useMemo(() => orders.reduce((sum, item) => sum + (item.total_price || 0), 0), [orders]);
  const withdrawTotal = useMemo(
    () => withdraws.filter((item) => item.status === 'pending').reduce((sum, item) => sum + (item.amount || 0), 0),
    [withdraws],
  );

  const handleWithdrawAction = async (id: number, action: 'approve' | 'reject') => {
    setActionLoadingId(id);
    setError('');
    try {
      if (action === 'approve') {
        await premiuminApi.adminApproveWithdraw(id, apiKey || undefined);
      } else {
        const notes = window.prompt('Catatan penolakan (opsional)?') || '';
        await premiuminApi.adminRejectWithdraw(id, notes, apiKey || undefined);
      }

      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memproses withdraw.');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHero
        title="Monitoring Transaksi"
        subtitle="Data transaksi ditarik langsung dari backend."
        slogan="Top up dan order tampil sesuai database in-memory/backend source."
        tone="from-sky-500/15 via-cyan-500/10 to-emerald-500/10"
        chips={['Top up', 'Order user', 'Monitoring live']}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Top Up Masuk</p>
          <p className="mt-2 text-2xl font-black text-white">{formatCurrency(topUpTotal)}</p>
          <p className="mt-2 text-sm text-white/45">Total nilai top up aktif.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Order User</p>
          <p className="mt-2 text-2xl font-black text-white">{formatCurrency(orderTotal)}</p>
          <p className="mt-2 text-sm text-white/45">Total transaksi order aktif.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Status Aktif</p>
          <p className="mt-2 text-2xl font-black text-white">Live</p>
          <p className="mt-2 text-sm text-white/45">Success, Pending, Processing, Failed.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Withdraw Pending</p>
          <p className="mt-2 text-2xl font-black text-white">{formatCurrency(withdrawTotal)}</p>
          <p className="mt-2 text-sm text-white/45">Total request tarik saldo.</p>
        </NeonCard>
      </section>

      <PageSection title="Monitoring transaksi" subtitle="Top up dan user order">
        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
          {[
            { key: 'topup' as const, label: 'Top Up', icon: ArrowDownLeft },
            { key: 'order' as const, label: 'User Order', icon: ArrowUpRight },
            { key: 'withdraw' as const, label: 'Withdraw', icon: Banknote },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  tab === item.key ? 'bg-brand text-white shadow-lg shadow-brand/20' : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-white/55">
          <ListFilter className="h-4 w-4" />
          {tab === 'topup' ? 'Menampilkan deposit dari backend.' : tab === 'order' ? 'Menampilkan order dari backend.' : 'Menampilkan withdraw pending dari backend.'}
        </div>

        {loading ? <p className="mt-4 text-sm text-white/45">Memuat transaksi...</p> : null}
        {error ? <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

        {tab === 'topup' ? (
          <div className="mt-4 overflow-hidden rounded-[1.2rem] border border-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="bg-[#0f0b15] text-white/45">
                  <tr>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">User ID</th>
                    <th className="px-4 py-3">Nominal</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">QR</th>
                  </tr>
                </thead>
                <tbody>
                  {topups.map((row) => (
                    <tr key={row.id || row.invoice} className="border-t border-white/10">
                      <td className="px-4 py-4 font-medium text-white">{row.invoice}</td>
                      <td className="px-4 py-4 text-white/70">{row.user_id || '-'}</td>
                      <td className="px-4 py-4 text-white">{formatCurrency(row.total_bayar || row.amount)}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
                          {row.status || 'pending'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-white/55">{row.qr_data ? 'Ada' : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : tab === 'order' ? (
          <div className="mt-4 overflow-hidden rounded-[1.2rem] border border-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="bg-[#0f0b15] text-white/45">
                  <tr>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Produk</th>
                    <th className="px-4 py-3">Nominal</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((row) => (
                    <tr key={row.id || row.invoice} className="border-t border-white/10">
                      <td className="px-4 py-4 font-medium text-white">{row.invoice}</td>
                      <td className="px-4 py-4 text-white/70">{row.product_name || '-'}</td>
                      <td className="px-4 py-4 text-white">{formatCurrency(row.total_price || 0)}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
                          {row.status || 'pending'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-white/55">{row.channel || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-[1.2rem] border border-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-[1000px] w-full text-left text-sm">
                <thead className="bg-[#0f0b15] text-white/45">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Nominal</th>
                    <th className="px-4 py-3">Rekening</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {withdraws.map((row) => (
                    <tr key={row.id} className="border-t border-white/10">
                      <td className="px-4 py-4 font-medium text-white">{row.id}</td>
                      <td className="px-4 py-4 text-white/70">{row.username || `User #${row.user_id}`}</td>
                      <td className="px-4 py-4 text-white">{formatCurrency(row.amount || 0)}</td>
                      <td className="px-4 py-4 text-white/65">{row.bank_account || '-'}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
                          {row.status || 'pending'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleWithdrawAction(row.id, 'approve')}
                            disabled={actionLoadingId === row.id || row.status !== 'pending'}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleWithdrawAction(row.id, 'reject')}
                            disabled={actionLoadingId === row.id || row.status !== 'pending'}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <NeonCard>
            <div className="flex items-center gap-3">
              <RefreshCcw className="h-5 w-5 text-brand" />
              <div>
                <p className="text-sm font-semibold text-white">Monitoring hidup</p>
                <p className="mt-1 text-sm leading-6 text-white/55">Data sekarang benar-benar ditarik dari backend.</p>
              </div>
            </div>
          </NeonCard>
          <NeonCard>
            <div className="flex items-center gap-3">
              <ReceiptText className="h-5 w-5 text-emerald-300" />
              <div>
                <p className="text-sm font-semibold text-white">Ringkasan aksi</p>
                <p className="mt-1 text-sm leading-6 text-white/55">Admin bisa cek top up dan order dari database.</p>
              </div>
            </div>
          </NeonCard>
        </div>
      </PageSection>
    </div>
  );
}
