import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, Bell, CheckCircle2, ListFilter, ReceiptText, RefreshCcw, XCircle } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { formatCurrency } from '../../../utils/format';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type DepositRecord, type OrderRecord, type WithdrawRecord } from '../../../services/api';

type TabKey = 'topup' | 'order' | 'withdraw';

const WITHDRAW_REJECT_REASONS = [
  { code: 'account_name_mismatch', label: 'Nama tidak sesuai', message: 'Nama penerima tidak sesuai dengan rekening/e-wallet tujuan.' },
  { code: 'account_number_invalid', label: 'Nomor rekening salah', message: 'Nomor rekening atau akun e-wallet tidak valid.' },
  { code: 'account_inactive', label: 'Akun tidak aktif', message: 'Rekening/e-wallet tujuan tidak aktif atau tidak bisa menerima dana.' },
  { code: 'duplicate_request', label: 'Request duplikat', message: 'Pengajuan withdraw terdeteksi duplikat dan dibatalkan.' },
  { code: 'other', label: 'Lainnya', message: 'Withdraw belum dapat diproses. Silakan cek kembali data tujuan.' },
];

export function MonitoringTransaksiPage({ apiKey: sessionApiKey }: { apiKey?: string } = {}) {
  const [tab, setTab] = useState<TabKey>('topup');
  const [topups, setTopups] = useState<DepositRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [withdraws, setWithdraws] = useState<WithdrawRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [rejectDraft, setRejectDraft] = useState<{ row: WithdrawRecord; reasonCode: string; notes: string; notifyUser: boolean } | null>(null);
  const [error, setError] = useState('');
  const apiKey = sessionApiKey || getApiKey();

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

  const handleWithdrawAction = async (id: number, action: 'approve' | 'reject', payload?: { reasonCode?: string; notes?: string; notifyUser?: boolean }) => {
    setActionLoadingId(id);
    setError('');
    try {
      if (action === 'approve') {
        await premiuminApi.adminApproveWithdraw(id, apiKey || undefined);
      } else {
        const preset = WITHDRAW_REJECT_REASONS.find((item) => item.code === payload?.reasonCode) || WITHDRAW_REJECT_REASONS[WITHDRAW_REJECT_REASONS.length - 1];
        const notes = payload?.notes?.trim() || preset.message;
        await premiuminApi.adminRejectWithdraw(id, notes, apiKey || undefined, {
          reason_code: preset.code,
          notify_user: payload?.notifyUser !== false,
          notification_message: `Withdraw dibatalkan: ${notes}`,
        });
      }

      await load();
      setRejectDraft(null);
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
          {tab === 'topup'
            ? 'Menampilkan deposit dari backend.'
            : tab === 'order'
              ? 'Menampilkan order dari backend.'
              : 'Kelola withdraw: selesaikan jika dana sudah dikirim, batalkan jika data tidak valid.'}
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
        ) : tab === 'withdraw' ? (
          <div className="mt-4 overflow-hidden rounded-[1.2rem] border border-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-[1000px] w-full text-left text-sm">
                <thead className="bg-[#0f0b15] text-white/45">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Nominal</th>
                    <th className="px-4 py-3">Metode</th>
                    <th className="px-4 py-3">No Akun</th>
                    <th className="px-4 py-3">Nama</th>
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
                      <td className="px-4 py-4 text-white/65">{row.bank_name || row.method || row.bank_account || '-'}</td>
                      <td className="px-4 py-4 text-white/65">{row.account_number || '-'}</td>
                      <td className="px-4 py-4 text-white/65">{row.account_name || '-'}</td>
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
                            Selesaikan
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectDraft({ row, reasonCode: 'account_name_mismatch', notes: WITHDRAW_REJECT_REASONS[0].message, notifyUser: true })}
                            disabled={actionLoadingId === row.id || row.status !== 'pending'}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Batalkan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

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

      {rejectDraft ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0a14] p-5 shadow-2xl shadow-brand/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black text-white">Batalkan Withdraw</p>
                <p className="mt-1 text-xs text-white/45">{rejectDraft.row.invoice || `Withdraw #${rejectDraft.row.id}`} • {formatCurrency(rejectDraft.row.amount || 0)}</p>
              </div>
              <button type="button" onClick={() => setRejectDraft(null)} className="rounded-xl border border-white/10 p-2 text-white/55">
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {WITHDRAW_REJECT_REASONS.map((reason) => (
                <button
                  key={reason.code}
                  type="button"
                  onClick={() => setRejectDraft((current) => current ? { ...current, reasonCode: reason.code, notes: reason.message } : current)}
                  className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
                    rejectDraft.reasonCode === reason.code ? 'border-brand/45 bg-brand/15 text-white' : 'border-white/10 bg-white/5 text-white/65 hover:bg-white/10'
                  }`}
                >
                  {reason.label}
                </button>
              ))}
            </div>

            <label className="mt-4 block">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Catatan untuk user</span>
              <textarea
                value={rejectDraft.notes}
                onChange={(event) => setRejectDraft((current) => current ? { ...current, notes: event.target.value } : current)}
                className="mt-2 min-h-[96px] w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-brand/50"
                placeholder="Contoh: Nama rekening tidak sesuai dengan nama penerima."
              />
            </label>

            <label className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={rejectDraft.notifyUser}
                onChange={(event) => setRejectDraft((current) => current ? { ...current, notifyUser: event.target.checked } : current)}
                className="accent-brand"
              />
              Kirim notifikasi ke user
            </label>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setRejectDraft(null)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/70">
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleWithdrawAction(rejectDraft.row.id, 'reject', { reasonCode: rejectDraft.reasonCode, notes: rejectDraft.notes, notifyUser: rejectDraft.notifyUser })}
                disabled={actionLoadingId === rejectDraft.row.id}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/15 px-4 py-3 text-sm font-black text-rose-100 disabled:opacity-60"
              >
                <Bell className="h-4 w-4" />
                Konfirmasi Batalkan
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
