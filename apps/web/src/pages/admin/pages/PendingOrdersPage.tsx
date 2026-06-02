import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCcw, Send, Trash2, RotateCcw, Eye, X, Copy, Check } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { formatCurrency, formatNumber } from '../../../utils/format';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type OrderRecord } from '../../../services/api';
import { useStablePolling } from '../../../hooks/useStablePolling';

type ModalMode = null | 'send-manual' | 'confirm-complete' | 'confirm-refund' | 'confirm-retry';

interface ManualOrderForm {
  email: string;
  password: string;
  note: string;
}

export function PendingOrdersPage({ apiKey: sessionApiKey }: { apiKey?: string } = {}) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [formData, setFormData] = useState<ManualOrderForm>({ email: '', password: '', note: '' });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const apiKey = sessionApiKey || getApiKey();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await premiuminApi.adminPendingOrders(apiKey || undefined);
      setOrders(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat pending orders.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [apiKey]);

  useStablePolling(() => load(), 20000, { immediate: false, pauseWhenHidden: true });

  const statusColor = (status?: string) => {
    const s = String(status || '').toLowerCase();
    if (s === 'pending_manual') return 'border-yellow-500/20 bg-yellow-500/10 text-yellow-300';
    if (s === 'waiting_provider') return 'border-sky-500/20 bg-sky-500/10 text-sky-300';
    if (s === 'cancelled') return 'border-rose-500/20 bg-rose-500/10 text-rose-300';
    return 'border-white/10 bg-white/5 text-white/45';
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleManualSend = async () => {
    if (!selectedOrder || !formData.email || !formData.password) {
      setError('Email dan password wajib diisi');
      return;
    }

    setActionLoading(selectedOrder.invoice);
    setError('');
    try {
      await premiuminApi.adminSendManualOrder(selectedOrder.invoice, formData, apiKey || undefined);
      await load();
      setModalMode(null);
      setSelectedOrder(null);
      setFormData({ email: '', password: '', note: '' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal mengirim order manual.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteOrder = async () => {
    if (!selectedOrder) return;
    setActionLoading(selectedOrder.invoice);
    setError('');
    try {
      await premiuminApi.adminCompleteOrder(selectedOrder.invoice, apiKey || undefined);
      await load();
      setModalMode(null);
      setSelectedOrder(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyelesaikan order.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefundOrder = async () => {
    if (!selectedOrder) return;
    setActionLoading(selectedOrder.invoice);
    setError('');
    try {
      await premiuminApi.adminCancelRefundOrder(selectedOrder.invoice, apiKey || undefined);
      await load();
      setModalMode(null);
      setSelectedOrder(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal cancel dan refund order.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryOrder = async () => {
    if (!selectedOrder) return;
    setActionLoading(selectedOrder.invoice);
    setError('');
    try {
      await premiuminApi.adminRetryOrder(selectedOrder.invoice, apiKey || undefined);
      await load();
      setModalMode(null);
      setSelectedOrder(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal retry provider order.');
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount = useMemo(() => orders.filter((o) => o.order_status === 'pending_manual').length, [orders]);
  const waitingCount = useMemo(() => orders.filter((o) => o.order_status === 'waiting_provider').length, [orders]);

  return (
    <div className="space-y-4">
      <PageHero
        title="Pending Orders"
        subtitle="Kelola order yang menunggu input manual atau provider API gagal."
        slogan="Retry, kirim data manual, atau refund sesuai kondisi order."
        tone="from-yellow-500/15 via-amber-500/10 to-orange-500/10"
        chips={['Manual fulfillment', 'Retry provider', 'Admin action']}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Pending Manual</p>
          <p className="mt-2 text-2xl font-black text-yellow-300">{formatNumber(pendingCount)}</p>
          <p className="mt-2 text-sm text-white/45">Menunggu input admin atau provider.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Waiting Provider</p>
          <p className="mt-2 text-2xl font-black text-sky-300">{formatNumber(waitingCount)}</p>
          <p className="mt-2 text-sm text-white/45">Provider sedang memproses request.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Total Pending</p>
          <p className="mt-2 text-2xl font-black text-white">{formatNumber(orders.length)}</p>
          <p className="mt-2 text-sm text-white/45">Jumlah order aktif yang tertunda.</p>
        </NeonCard>
      </section>

      <PageSection title="Daftar Pending Orders" subtitle="Aksi manual untuk order yang gagal atau tertunda">
        {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

        {loading ? <p className="text-sm text-white/45">Memuat pending orders...</p> : null}
        {!loading && !orders.length && !error ? <p className="text-sm text-white/45">Tidak ada pending orders.</p> : null}

        <div className="mt-4 overflow-hidden rounded-[1.2rem] border border-white/10">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-left text-sm">
              <thead className="bg-[#0f0b15] text-white/45">
                <tr>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Produk</th>
                  <th className="px-4 py-3">Nominal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Retry</th>
                  <th className="px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((row) => (
                  <tr key={row.invoice} className="border-t border-white/10 hover:bg-white/5 transition">
                    <td className="px-4 py-4 font-mono font-bold text-white text-xs">{row.invoice}</td>
                    <td className="px-4 py-4 text-white/70">{row.username || `User #${row.user_id}`}</td>
                    <td className="px-4 py-4 text-white">{row.product_name || '-'}</td>
                    <td className="px-4 py-4 text-white font-bold">{formatCurrency(row.total_price || 0)}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusColor(row.order_status)}`}>
                        {String(row.order_status || 'pending').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-white/55">{row.created_at?.slice(0, 10) || '-'}</td>
                    <td className="px-4 py-4 text-white font-bold">{row.retry_count || 0}/3</td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(row)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-bold text-white hover:bg-white/10 transition"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </PageSection>

      {selectedOrder ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#0d0912] shadow-2xl shadow-brand/20 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 sticky top-0 bg-[#0d0912] px-5 py-4">
              <div>
                <p className="text-sm font-black text-white">{selectedOrder.product_name || 'Order'}</p>
                <p className="mt-1 text-xs text-white/40">{selectedOrder.invoice}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedOrder(null);
                  setModalMode(null);
                }}
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/65 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid gap-3 text-sm">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Status</p>
                  <p className="mt-2 font-bold text-white">{String(selectedOrder.order_status || 'pending').replace('_', ' ')}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Nominal</p>
                  <p className="mt-2 font-bold text-white">{formatCurrency(selectedOrder.total_price || 0)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Retry Count</p>
                  <p className="mt-2 font-bold text-white">
                    {selectedOrder.retry_count || 0}/3
                  </p>
                </div>
              </div>

              {selectedOrder.manual_email ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm">
                  <p className="font-black text-emerald-300">Data Manual Terkirim</p>
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Email</p>
                        <p className="font-mono text-white">{selectedOrder.manual_email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedOrder.manual_email || '', 'email')}
                        className="p-2 hover:bg-white/10 rounded transition"
                      >
                        {copied === 'email' ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4 text-white/50" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Password</p>
                        <p className="font-mono text-white">{selectedOrder.manual_password}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedOrder.manual_password || '', 'password')}
                        className="p-2 hover:bg-white/10 rounded transition"
                      >
                        {copied === 'password' ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4 text-white/50" />}
                      </button>
                    </div>
                    {selectedOrder.manual_note ? (
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">
                        Catatan: <span className="text-white">{selectedOrder.manual_note}</span>
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {modalMode === 'send-manual' ? (
                <div className="space-y-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
                  <p className="text-sm font-bold text-sky-200">Kirim Data Manual</p>
                  <input
                    type="email"
                    placeholder="Email / Username"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-xl bg-black/40 px-3 py-2 text-sm text-white placeholder-white/30 border border-white/10"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full rounded-xl bg-black/40 px-3 py-2 text-sm text-white placeholder-white/30 border border-white/10"
                  />
                  <textarea
                    placeholder="Catatan akun (opsional)"
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    rows={2}
                    className="w-full rounded-xl bg-black/40 px-3 py-2 text-sm text-white placeholder-white/30 border border-white/10"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleManualSend}
                      disabled={actionLoading === selectedOrder.invoice}
                      className="flex-1 rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {actionLoading === selectedOrder.invoice ? 'Mengirim...' : 'Kirim Pesanan'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModalMode(null);
                        setFormData({ email: '', password: '', note: '' });
                      }}
                      className="flex-1 rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-white"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode('send-manual')}
                  disabled={actionLoading === selectedOrder.invoice || selectedOrder.order_status === 'success'}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Kirim Data
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode('confirm-complete')}
                  disabled={actionLoading === selectedOrder.invoice || selectedOrder.order_status === 'success'}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Selesaikan
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode('confirm-refund')}
                  disabled={actionLoading === selectedOrder.invoice || selectedOrder.order_status === 'cancelled'}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Refund
                </button>
                {(selectedOrder.retry_count || 0) < 3 ? (
                  <button
                    type="button"
                    onClick={() => setModalMode('confirm-retry')}
                    disabled={actionLoading === selectedOrder.invoice}
                    className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-200 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                ) : null}
              </div>

              {modalMode === 'confirm-complete' ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-emerald-300 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-emerald-300">Tandai Selesai?</p>
                      <p className="mt-1 text-sm text-emerald-200/80">Order akan ditandai selesai tanpa refund. Saldo user tidak berubah.</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={handleCompleteOrder}
                          disabled={actionLoading === selectedOrder.invoice}
                          className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          Ya, Selesaikan
                        </button>
                        <button type="button" onClick={() => setModalMode(null)} className="rounded-lg border border-emerald-500/30 px-4 py-2 text-xs font-bold text-emerald-200">
                          Batal
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {modalMode === 'confirm-refund' ? (
                <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-rose-300 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-rose-300">Batal & Refund?</p>
                      <p className="mt-1 text-sm text-rose-200/80">Saldo user akan dikembalikan sebesar {formatCurrency(selectedOrder.total_price || 0)}. Tidak ada double refund.</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={handleRefundOrder}
                          disabled={actionLoading === selectedOrder.invoice}
                          className="rounded-lg bg-rose-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          Ya, Refund
                        </button>
                        <button type="button" onClick={() => setModalMode(null)} className="rounded-lg border border-rose-500/30 px-4 py-2 text-xs font-bold text-rose-200">
                          Batal
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {modalMode === 'confirm-retry' ? (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-300 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-300">Retry Provider?</p>
                      <p className="mt-1 text-sm text-amber-200/80">
                        Sistem akan mencoba API Premku lagi. Jika gagal, tetap pending_manual. Attempt {(selectedOrder.retry_count || 0) + 1}/3.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={handleRetryOrder}
                          disabled={actionLoading === selectedOrder.invoice}
                          className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          Ya, Retry
                        </button>
                        <button type="button" onClick={() => setModalMode(null)} className="rounded-lg border border-amber-500/30 px-4 py-2 text-xs font-bold text-amber-200">
                          Batal
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
