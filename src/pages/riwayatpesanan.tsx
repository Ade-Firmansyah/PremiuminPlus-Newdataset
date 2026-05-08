import { useEffect, useState } from 'react';
import { Eye, ImageIcon, Loader2, X } from 'lucide-react';
import { PageHero, PageSection } from './dashboardPageKit';
import { premiuminApi, type OrderRecord } from '../services/api';
import { getApiKey } from '../store/useAuth';
import { formatCurrency } from '../utils/format';

function statusTone(status?: string) {
  const value = String(status || 'pending').toLowerCase();
  if (value === 'success') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
  if (value === 'processing') return 'border-sky-500/20 bg-sky-500/10 text-sky-300';
  if (value === 'failed') return 'border-rose-500/20 bg-rose-500/10 text-rose-300';
  if (value === 'expired' || value === 'canceled') return 'border-white/10 bg-white/5 text-white/45';
  return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
}

function statusLabel(order: OrderRecord) {
  const payment = String(order.payment_status || '').toLowerCase();
  const status = String(order.order_status || order.status || '').toLowerCase();
  if (payment && payment !== 'success') return 'Pending Payment';
  if (status === 'success') return 'Success';
  if (status === 'failed') return 'Failed';
  if (status === 'processing') return 'Processing Provider';
  return 'Pending Payment';
}

function textValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

export default function RiwayatPesanan() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const apiKey = getApiKey();

  useEffect(() => {
    const loadOrders = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await premiuminApi.transactions(apiKey || undefined);
        setOrders(response.data);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Gagal memuat riwayat pesanan.');
      } finally {
        setLoading(false);
      }
    };

    void loadOrders();
    const timer = window.setInterval(() => void loadOrders(), 10000);
    const refresh = () => void loadOrders();
    window.addEventListener('premiuminplus:orders-updated', refresh);
    window.addEventListener('premiuminplus:balance-updated', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('premiuminplus:orders-updated', refresh);
      window.removeEventListener('premiuminplus:balance-updated', refresh);
    };
  }, [apiKey]);

  const openDetail = async (order: OrderRecord) => {
    setSelectedOrder(order);
    setDetailLoading(true);
    setError('');
    try {
      const response = await premiuminApi.orderStatus(order.invoice, apiKey || undefined);
      setSelectedOrder(response.data);
      setOrders((current) => current.map((item) => (item.invoice === response.data.invoice ? response.data : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat detail pesanan.');
    } finally {
      setDetailLoading(false);
    }
  };

  const selectedStatus = selectedOrder ? statusLabel(selectedOrder) : '';
  const selectedAccount =
    selectedOrder?.accounts?.[0] ||
    (selectedOrder?.account_data && typeof selectedOrder.account_data === 'object' ? selectedOrder.account_data : null);

  return (
    <div className="riwayat-pesanan">
      <PageHero
        title="Riwayat Pesanan"
        subtitle="Histori order langsung dari transaksi backend."
        slogan="Status, akun, dan detail produk mengikuti data transaksi."
        tone="from-violet-500/15 via-fuchsia-500/10 to-brand/10"
        chips={['Order history', 'DB sync', 'Account data']}
      />
      <div className="mt-4">
        <PageSection title="Daftar transaksi" subtitle="History transaksi order">
          {loading ? <p className="text-sm text-white/45">Memuat riwayat pesanan...</p> : null}
          {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
          {!loading && !orders.length && !error ? <p className="text-sm text-white/45">Belum ada pesanan.</p> : null}

          <div className="grid gap-3">
            {orders.map((order) => (
              <button
                key={order.invoice}
                type="button"
                onClick={() => void openDetail(order)}
                className="grid gap-3 rounded-[1.1rem] border border-white/10 bg-[#0f0b15] p-3 text-left transition hover:border-brand/30 hover:bg-white/[0.07] sm:grid-cols-[56px_1fr_auto]"
              >
                <div className="grid h-16 w-full place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  {order.product_image ? (
                    <img src={order.product_image} alt={order.product_name || 'Produk'} className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-white/30" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-white">{order.product_name || 'Produk digital'}</p>
                  <p className="mt-1 truncate text-xs text-white/40">{order.invoice}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusTone(order.order_status || order.status)}`}>
                      {statusLabel(order)}
                    </span>
                    <span className="text-xs font-semibold text-white/45">{order.created_at || '-'}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                  <p className="text-sm font-black text-white">{formatCurrency(order.total_price || 0)}</p>
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/70">
                    <Eye className="h-3.5 w-3.5" />
                    Detail
                  </span>
                </div>
              </button>
            ))}
          </div>
        </PageSection>
      </div>

      {selectedOrder ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#0d0912] shadow-2xl shadow-brand/20">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-sm font-black text-white">{selectedOrder.product_name || 'Produk digital'}</p>
                <p className="mt-1 text-xs text-white/40">{selectedOrder.invoice}</p>
              </div>
              <button type="button" onClick={() => setSelectedOrder(null)} className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/65">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={`inline-flex rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${statusTone(selectedOrder.order_status || selectedOrder.status)}`}>
                  {selectedStatus}
                </span>
                <p className="text-lg font-black text-white">{formatCurrency(selectedOrder.total_price || 0)}</p>
              </div>

              {detailLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sinkron status Premku...
                </div>
              ) : null}

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Provider</p>
                  <p className="mt-2 font-bold text-white">{selectedOrder.provider_status || selectedOrder.order_status || selectedOrder.status || '-'}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Payment</p>
                  <p className="mt-2 font-bold text-white">{selectedOrder.payment_status || 'success'}</p>
                </div>
              </div>

              {String(selectedOrder.order_status || selectedOrder.status).toLowerCase() === 'success' ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  <p className="font-black">Data akun</p>
                  <p className="mt-2">Email: <b className="text-white">{textValue(selectedAccount?.username || selectedAccount?.email)}</b></p>
                  <p>Password: <b className="text-white">{textValue(selectedAccount?.password || selectedAccount?.pass)}</b></p>
                </div>
              ) : (
                <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm leading-6 text-sky-100">
                  Pesanan masih menunggu provider. Data akun akan muncul setelah Premku mengirim status success dan akun tersimpan ke database.
                </div>
              )}

              <button
                type="button"
                onClick={() => void openDetail(selectedOrder)}
                disabled={detailLoading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                {detailLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Refresh Detail
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
