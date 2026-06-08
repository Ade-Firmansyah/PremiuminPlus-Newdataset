import { useCallback, useEffect, useState } from 'react';
import { Copy, Eye, Loader2, X } from 'lucide-react';
import { PageHero, PageSection } from './dashboardPageKit';
import { premiuminApi, type OrderRecord } from '../services/api';
import { getApiKey } from '../store/useAuth';
import { formatCurrency } from '../utils/format';
import { useStablePolling } from '../hooks/useStablePolling';

const DEFAULT_PRODUCT_IMAGE = '/default-product.webp';

function statusTone(status?: string) {
  const value = String(status || 'pending').toLowerCase();
  if (['success', 'provider_success', 'credential_delivery'].includes(value)) return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
  if (['processing', 'provider_processing', 'waiting_provider'].includes(value)) return 'border-sky-500/20 bg-sky-500/10 text-sky-300';
  if (value === 'failed') return 'border-rose-500/20 bg-rose-500/10 text-rose-300';
  if (value === 'expired' || value === 'canceled') return 'border-white/10 bg-white/5 text-white/45';
  return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
}

function statusLabel(order: OrderRecord) {
  const payment = String(order.payment_status || '').toLowerCase();
  const status = String(order.order_status || order.status || '').toLowerCase();
  if (payment && payment !== 'success') return 'Pending Payment';
  if (['success', 'provider_success', 'credential_delivery'].includes(status)) return 'Berhasil';
  if (status === 'failed') return 'Failed';
  if (status === 'processing' || status === 'provider_processing') return 'Processing Provider';
  if (status === 'pending_manual' || status === 'manual_required') return 'Pending Manual';
  if (status === 'waiting_provider') return 'Waiting Provider';
  if (status === 'cancelled' || status === 'canceled') return 'Cancelled';
  return 'Pending Payment';
}

function fulfillmentBadge(fulfillmentType?: string) {
  if (!fulfillmentType) return null;
  const type = String(fulfillmentType).toLowerCase();
  if (type === 'manual_admin') return { label: 'MANUAL ADMIN', color: 'border-blue-500/20 bg-blue-500/10 text-blue-300' };
  if (type === 'provider_auto') return { label: 'AUTO PROVIDER', color: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' };
  if (type === 'refund') return { label: 'REFUNDED', color: 'border-rose-500/20 bg-rose-500/10 text-rose-300' };
  if (type === 'retry') return { label: 'RETRY', color: 'border-amber-500/20 bg-amber-500/10 text-amber-200' };
  return null;
}

function textValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function formatOrderDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
    timeZoneName: 'short',
  }).format(date);
}

function productImage(order: OrderRecord) {
  return order.product_image || DEFAULT_PRODUCT_IMAGE;
}

function accountFromOrder(order?: OrderRecord | null) {
  if (!order) return null;
  return order.accounts?.[0] ||
    (order.account_data && typeof order.account_data === 'object' ? order.account_data : null);
}

function rawValue(order: OrderRecord, key: string) {
  const raw = order.raw_response;
  if (!raw || typeof raw !== 'object') return '';
  return String((raw as Record<string, unknown>)[key] || '');
}

function accessUrl(order: OrderRecord) {
  return rawValue(order, 'email_access_url') || rawValue(order, 'access_url') || '';
}

function tutorialUrl(order: OrderRecord) {
  return order.product_tutorial_url || rawValue(order, 'tutorial_url') || '';
}

function copyText(value: string) {
  if (!value || value === '-') return;
  void navigator.clipboard.writeText(value);
}

function hasActiveOrder(rows: OrderRecord[]) {
  return rows.some((order) => {
    const payment = String(order.payment_status || '').toLowerCase();
    const status = String(order.order_status || order.status || '').toLowerCase();
    return ['pending', 'processing', 'provider_processing', 'waiting_provider'].includes(status) || (payment && !['success', 'failed', 'expired', 'canceled', 'refunded'].includes(payment));
  });
}

function canShowCredential(order: OrderRecord) {
  const status = String(order.order_status || order.status || '').toLowerCase();
  const delivery = String(order.delivery_status || '').toLowerCase();
  return ['success', 'provider_success', 'credential_delivery'].includes(status) || delivery === 'sent';
}

export default function RiwayatPesanan() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const apiKey = getApiKey();

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const response = await premiuminApi.transactions(apiKey || undefined);
      setOrders(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat riwayat pesanan.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useStablePolling(() => loadOrders(true), 30000, {
    enabled: hasActiveOrder(orders),
    immediate: false,
    pauseWhenHidden: true,
    focusThrottleMs: 15000,
  });

  useEffect(() => {
    const refresh = () => void loadOrders(true);
    window.addEventListener('premiuminplus:orders-updated', refresh);
    window.addEventListener('premiuminplus:balance-updated', refresh);
    return () => {
      window.removeEventListener('premiuminplus:orders-updated', refresh);
      window.removeEventListener('premiuminplus:balance-updated', refresh);
    };
  }, [loadOrders]);

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
  const selectedAccount = accountFromOrder(selectedOrder);

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
            {orders.map((order) => {
              const badge = fulfillmentBadge(order.fulfillment_type);
              const account = accountFromOrder(order);
              const email = textValue(account?.email || account?.username || order.email_account);
              const password = textValue(account?.password || account?.pass || order.password_account);
              const tutorial = tutorialUrl(order);
              const access = accessUrl(order);
              const canCopyAccount = canShowCredential(order);
              const copyAll = [
                `Produk: ${order.product_name || 'Produk digital'}`,
                `Invoice: ${order.invoice}`,
                `Email: ${email}`,
                `Password: ${password}`,
                access ? `Akses: ${access}` : '',
                tutorial ? `Tutorial: ${tutorial}` : '',
              ].filter(Boolean).join('\n');

              return (
                <article
                  key={order.invoice}
                  className="grid gap-4 rounded-[1.1rem] border border-white/10 bg-[#0f0b15] p-3 text-left transition hover:border-brand/30 hover:bg-white/[0.07] md:grid-cols-[96px_minmax(0,1fr)_160px]"
                >
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5 md:h-24">
                    <img src={productImage(order)} alt={order.product_name || 'Produk'} className="h-full min-h-24 w-full object-cover" loading="lazy" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-base font-extrabold text-white">{order.product_name || 'Produk digital'}</p>
                    <div className="mt-3 grid gap-2 text-sm text-white/65 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Invoice</p>
                        <p className="mt-1 break-all font-mono text-xs text-white/75">{order.invoice}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Tanggal</p>
                        <p className="mt-1 text-white/75">{formatOrderDate(order.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Status</p>
                        <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusTone(order.order_status || order.status)}`}>
                          {statusLabel(order)}
                        </span>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Metode</p>
                        {badge ? (
                          <span className={`mt-1 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${badge.color}`}>
                            {badge.label}
                          </span>
                        ) : (
                          <p className="mt-1 text-white/75">-</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 border-t border-white/10 pt-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Detail Akun</p>
                      {canCopyAccount ? (
                        <div className="mt-3 grid gap-2 text-sm">
                          <p className="break-all text-white/70">Email: <b className="text-white">{email}</b></p>
                          <p className="break-all text-white/70">Password: <b className="text-white">{password}</b></p>
                          {access ? <p className="break-all text-white/70">Akses: <b className="text-white">{access}</b></p> : null}
                          {tutorial ? <p className="break-all text-white/70">Tutorial: <b className="text-white">{tutorial}</b></p> : null}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" onClick={() => copyText(email)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/75">
                              <Copy className="h-3.5 w-3.5" /> Copy Email
                            </button>
                            <button type="button" onClick={() => copyText(password)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/75">
                              <Copy className="h-3.5 w-3.5" /> Copy Password
                            </button>
                            <button type="button" onClick={() => copyText(copyAll)} className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white">
                              <Copy className="h-3.5 w-3.5" /> Copy Semua
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-sm leading-6 text-sky-100/80">Akun akan tampil setelah provider success dan credential tersimpan ke database.</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 md:flex-col md:items-end">
                    <div className="md:text-right">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Harga</p>
                      <p className="mt-1 text-base font-black text-white">{formatCurrency(order.product_price || order.total_price || 0)}</p>
                    </div>
                    <button type="button" onClick={() => void openDetail(order)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/70">
                      <Eye className="h-3.5 w-3.5" />
                      Detail
                    </button>
                  </div>
                </article>
              );
            })}
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
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${statusTone(selectedOrder.order_status || selectedOrder.status)}`}>
                    {selectedStatus}
                  </span>
                  {fulfillmentBadge(selectedOrder.fulfillment_type) && (
                    <span className={`inline-flex rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] ${fulfillmentBadge(selectedOrder.fulfillment_type)?.color}`}>
                      {fulfillmentBadge(selectedOrder.fulfillment_type)?.label}
                    </span>
                  )}
                </div>
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

              {selectedOrder.fulfilled_at ? (
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
                  <p className="font-black">Admin Fulfillment</p>
                  <p className="mt-2">Diproses oleh admin pada: <b className="text-white">{selectedOrder.fulfilled_at}</b></p>
                  {selectedOrder.manual_note && <p className="mt-2">Catatan: <b className="text-white">{selectedOrder.manual_note}</b></p>}
                </div>
              ) : null}

              {canShowCredential(selectedOrder) ? (
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
