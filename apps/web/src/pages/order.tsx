import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, ImageIcon, Loader2, MessageCircle, Minus, Phone, Plus, RefreshCw, Sparkles, ShoppingBag, ShoppingCart, X } from 'lucide-react';
import { PageHero, NeonCard } from './dashboardPageKit';
import { formatCurrency } from '../utils/format';
import { getApiKey } from '../store/useAuth';
import { premiuminApi, type AppRole, type DirectPaymentRecord, type ProductRecord } from '../services/api';
import { useStablePolling } from '../hooks/useStablePolling';

const directPaymentStorageKey = 'premiuminplus:direct-payment-invoice';

function renderQrSource(value?: string | null) {
  if (!value) return '';
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

function normalizeDirectPaymentStatus(status?: string | null) {
  const value = String(status || 'pending').toLowerCase();
  if (value === 'payment_success') return 'success';
  if (value === 'pending_payment') return 'pending';
  if (value === 'payment_mismatch' || value === 'manual_required') return 'failed';
  return value;
}

function isProviderDone(payment: DirectPaymentRecord | null) {
  return normalizeDirectPaymentStatus(payment?.status) === 'success' && payment?.order?.order_status === 'success';
}

function isProviderFailed(payment: DirectPaymentRecord | null) {
  return ['failed', 'expired', 'canceled', 'payment_mismatch', 'manual_required'].includes(String(payment?.order?.order_status || payment?.status || '').toLowerCase());
}

function isExpiredTimestamp(value?: string | null) {
  if (!value) return false;
  const expiry = new Date(value).getTime();
  return Number.isFinite(expiry) && expiry <= Date.now();
}

function paymentStatusTone(status: string) {
  if (status === 'success') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';
  if (status === 'pending') return 'border-amber-500/20 bg-amber-500/10 text-amber-200';
  if (status === 'expired' || status === 'canceled') return 'border-white/10 bg-white/5 text-white/45';
  return 'border-rose-500/20 bg-rose-500/10 text-rose-200';
}

export default function Order() {
  const [catalog, setCatalog] = useState<ProductRecord[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number>(0);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [saldo, setSaldo] = useState(0);
  const [role, setRole] = useState<AppRole>('member');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [lastOrder, setLastOrder] = useState<Awaited<ReturnType<typeof premiuminApi.order>>['data'] | null>(null);
  const [adminWhatsapp, setAdminWhatsapp] = useState('');
  const [showDirectConfirm, setShowDirectConfirm] = useState(false);
  const [directPayment, setDirectPayment] = useState<DirectPaymentRecord | null>(null);
  const [directLoading, setDirectLoading] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentSecondsLeft, setPaymentSecondsLeft] = useState(0);
  const checkingPaymentRef = useRef(false);
  const expiryCheckRef = useRef('');
  const mountedRef = useRef(true);
  const apiKey = getApiKey();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedProductId = Number(searchParams.get('product_id') || 0);
  const waOrderLink = adminWhatsapp ? `https://wa.me/${adminWhatsapp}?text=Masih%20ada%20slot%20join%20reseller%20%3F` : '';
  const directQrSource = renderQrSource(directPayment?.qr_image || directPayment?.qr_raw);
  const directStatusRaw = normalizeDirectPaymentStatus(directPayment?.status);
  const directStatusExpiredByTime = directStatusRaw === 'pending' && Boolean(directPayment?.expired_at) && paymentSecondsLeft <= 0 && isExpiredTimestamp(directPayment?.expired_at);
  const directStatus = directStatusExpiredByTime ? 'expired' : directStatusRaw;
  const directPaymentPending = directStatus === 'pending';
  const directPaymentTerminal = ['success', 'failed', 'expired', 'canceled'].includes(directStatus);
  const canShowDirectQr = Boolean(directPaymentPending && paymentSecondsLeft > 0 && directQrSource);
  const canCheckDirectPayment = Boolean(directPaymentPending && !checkingPayment);
  const canCancelDirectPayment = Boolean(directPaymentPending && !directLoading);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      checkingPaymentRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    premiuminApi.publicConfig()
      .then((response) => {
        if (active) setAdminWhatsapp(response.data.admin_whatsapp || '');
      })
      .catch(() => {
        if (active) setAdminWhatsapp('');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadCatalog = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await premiuminApi.products(apiKey || undefined);
        setCatalog(response.data);
        const queryProduct = response.data.find((item) => Number(item.id) === requestedProductId);
        setSelectedProductId(queryProduct?.id || response.data[0]?.id || 1);
        const meResponse = await premiuminApi.me(apiKey || undefined);
        if (!active || !mountedRef.current) return;
        setSaldo(meResponse.data.usable_balance ?? meResponse.data.saldo);
        setRole(meResponse.data.role);
      } catch (caught) {
        if (active && mountedRef.current) setError(caught instanceof Error ? caught.message : 'Gagal memuat katalog produk.');
      } finally {
        if (active && mountedRef.current) setLoading(false);
      }
    };

    void loadCatalog();
    return () => {
      active = false;
    };
  }, [apiKey, requestedProductId]);

  useEffect(() => {
    const invoice = sessionStorage.getItem(directPaymentStorageKey);
    if (!invoice) return;

    let active = true;
    premiuminApi
      .directPaymentStatus(invoice, apiKey || undefined)
      .then((response) => {
        if (!active || !mountedRef.current) return;
        if (!isProviderFailed(response.data)) {
          setDirectPayment(response.data);
        } else {
          sessionStorage.removeItem(directPaymentStorageKey);
        }
      })
      .catch(() => {
        if (active) sessionStorage.removeItem(directPaymentStorageKey);
      });

    return () => {
      active = false;
    };
  }, [apiKey]);

  const selectedProduct = useMemo(
    () => catalog.find((item) => item.id === selectedProductId) || catalog[0],
    [catalog, selectedProductId],
  );
  const selectedReady = Boolean(selectedProduct && Number(selectedProduct.stock || 0) > 0);

  const total = (selectedProduct?.final_price || 0) * qty;

  const applyDirectPaymentResult = async (payment: DirectPaymentRecord) => {
    if (!mountedRef.current) return;
    setDirectPayment(payment);
    window.dispatchEvent(new Event('premiuminplus:orders-updated'));
    if (isProviderFailed(payment)) {
      sessionStorage.removeItem(directPaymentStorageKey);
    } else {
      sessionStorage.setItem(directPaymentStorageKey, payment.invoice);
    }
    if (normalizeDirectPaymentStatus(payment.status) === 'success' && payment.order?.order_status === 'success') {
      setResult('Pesanan berhasil diproses.');
      setLastOrder({
        invoice: payment.order.invoice,
        product_name: payment.order.product_name,
        total_price: payment.order.total_price,
        status: payment.order.order_status,
        account_data: {
          email: payment.order.email_account || undefined,
          password: payment.order.password_account || undefined,
        },
        created_at: payment.order.created_at,
      });
      try {
        const meResponse = await premiuminApi.me(apiKey || undefined);
        if (!mountedRef.current) return;
        setSaldo(meResponse.data.usable_balance ?? meResponse.data.saldo);
        window.dispatchEvent(new Event('premiuminplus:balance-updated'));
      } catch {
        // Balance refresh is best-effort; payment result stays visible.
      }
    }
  };

  const checkDirectPayment = async (invoice = directPayment?.invoice) => {
    if (!invoice || checkingPaymentRef.current) return;
    checkingPaymentRef.current = true;
    setCheckingPayment(true);
    setError('');
    try {
      const response = await premiuminApi.directPaymentStatus(invoice, apiKey || undefined);
      await applyDirectPaymentResult(response.data);
    } catch (caught) {
      if (mountedRef.current) setError(caught instanceof Error ? caught.message : 'Gagal mengecek status pembayaran.');
    } finally {
      checkingPaymentRef.current = false;
      if (mountedRef.current) setCheckingPayment(false);
    }
  };

  useStablePolling(
    () => checkDirectPayment(directPayment?.invoice),
    15000,
    {
      enabled: Boolean(directPayment && directPaymentPending && !isProviderDone(directPayment) && !isProviderFailed(directPayment)),
      immediate: false,
      pauseWhenHidden: true,
      focusThrottleMs: 10000,
    },
  );

  useEffect(() => {
    if (!directPayment?.expired_at || directPayment.status !== 'pending') {
      setPaymentSecondsLeft(0);
      expiryCheckRef.current = '';
      return;
    }
    const update = () => {
      const next = Math.max(0, Math.floor((new Date(directPayment.expired_at || '').getTime() - Date.now()) / 1000));
      if (mountedRef.current) setPaymentSecondsLeft(Number.isFinite(next) ? next : 0);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [directPayment?.expired_at, directPayment?.status]);

  useEffect(() => {
    if (!directPayment?.invoice || directPayment.status !== 'pending' || paymentSecondsLeft > 0) return;
    const expiry = new Date(directPayment.expired_at || '').getTime();
    if (!Number.isFinite(expiry) || expiry > Date.now()) return;
    if (expiryCheckRef.current === directPayment.invoice) return;
    expiryCheckRef.current = directPayment.invoice;
    void checkDirectPayment(directPayment.invoice);
  }, [directPayment?.expired_at, directPayment?.invoice, directPayment?.status, paymentSecondsLeft]);

  const startDirectPayment = async (override?: { productId?: number | null; qty?: number | null }) => {
    const productId = Number(override?.productId || selectedProduct?.id || 0);
    const product = catalog.find((item) => item.id === productId) || selectedProduct;
    const orderQty = Math.max(1, Number(override?.qty || qty || 1));
    if (!product) return;
    setShowDirectConfirm(false);
    setDirectLoading(true);
    setError('');
    setResult('');
    try {
      const response = await premiuminApi.directOrderPayment({ product_id: product.id, qty: orderQty }, apiKey || undefined);
      if (mountedRef.current) {
        sessionStorage.setItem(directPaymentStorageKey, response.data.invoice);
        setDirectPayment(response.data);
      }
    } catch (caught) {
      if (mountedRef.current) setError(caught instanceof Error ? caught.message : 'Gagal membuat QRIS pembayaran.');
    } finally {
      if (mountedRef.current) setDirectLoading(false);
    }
  };

  const restartDirectPayment = () => {
    if (!directPayment) return;
    const productId = directPayment.product_id || selectedProduct?.id || 0;
    const orderQty = directPayment.qty || qty;
    sessionStorage.removeItem(directPaymentStorageKey);
    if (directPayment.product_id) setSelectedProductId(Number(directPayment.product_id));
    if (directPayment.qty) setQty(Number(directPayment.qty));
    void startDirectPayment({ productId, qty: orderQty });
  };

  const cancelDirectPayment = async () => {
    if (!directPayment?.invoice) return;
    setDirectLoading(true);
    try {
      const response = await premiuminApi.directPaymentCancel(directPayment.invoice, apiKey || undefined);
      if (mountedRef.current) {
        sessionStorage.removeItem(directPaymentStorageKey);
        setDirectPayment(null);
      }
    } catch (caught) {
      if (mountedRef.current) setError(caught instanceof Error ? caught.message : 'Gagal membatalkan pembayaran.');
    } finally {
      if (mountedRef.current) setDirectLoading(false);
    }
  };

  const submitOrder = async () => {
    if (!selectedProduct) {
      setError('Produk belum tersedia.');
      return;
    }
    if (Number(selectedProduct.stock || 0) <= 0) {
      setError('Produk belum tersedia.');
      return;
    }

    setOrdering(true);
    setError('');
    setResult('');
    setLastOrder(null);

    if (saldo < total) {
      if (role === 'member') {
        setError('Saldo tidak cukup. Silakan deposit saldo terlebih dahulu atau bayar QRIS langsung.');
        setShowDirectConfirm(true);
      } else {
        setError('Saldo reseller tidak cukup. Silakan deposit saldo terlebih dahulu.');
      }
      setOrdering(false);
      return;
    }

    try {
      const response = await premiuminApi.order({ product_id: selectedProduct.id, qty }, apiKey || undefined);
      const refreshed = await premiuminApi.orderStatus(response.data.invoice, apiKey || undefined);
      setResult(`Order berhasil dibuat. Invoice: ${response.data.invoice}`);
      setLastOrder(refreshed.data);
      const meResponse = await premiuminApi.me(apiKey || undefined);
      setSaldo(meResponse.data.usable_balance ?? meResponse.data.saldo);
      window.dispatchEvent(new Event('premiuminplus:balance-updated'));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Gagal membuat order.';
      setError(message.includes('Saldo') ? `${message} Silakan deposit saldo terlebih dahulu.` : message);
    } finally {
      setOrdering(false);
    }
  };

  return (
    <div className="order space-y-4">
      <PageHero
        title="Order Akun"
        subtitle="Pilih layanan, atur qty, lalu kirim pesanan dengan alur yang cepat dan rapi."
        slogan="Cepat diproses, jelas detailnya, dan tetap nyaman dilihat di desktop maupun HP."
        tone="from-emerald-500/15 via-sky-500/10 to-brand/10"
        chips={['Produk premium', 'Checkout ringkas', 'Support WA']}
      />

      <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <NeonCard className="overflow-hidden">
          <div className="flex h-full flex-col justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Preview layanan</p>
                <h3 className="text-lg font-extrabold text-white">{selectedProduct?.name || 'Memuat...'}</h3>
              </div>
            </div>
            <div className="rounded-[1.05rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.08),rgba(14,165,233,0.08))] p-5 text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-white/45">Harga layanan</p>
              <p className="mt-3 text-3xl font-black text-white">{formatCurrency(selectedProduct?.final_price || 0)}</p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-white/55">
                {selectedProduct?.note || 'Produk dikirim setelah order masuk ke antrian.'}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Saldo kamu</p>
                <p className="mt-2 text-lg font-black text-white">{formatCurrency(saldo)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Status</p>
                <p className="mt-2 text-lg font-black text-emerald-300">Siap order</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-brand/20 bg-brand/10 px-4 py-3 text-sm text-white/75">
              <Sparkles className="h-4 w-4 text-brand-light" />
              Pesanan yang jelas biasanya lebih cepat diproses.
            </div>
          </div>
        </NeonCard>

        <NeonCard>
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-extrabold text-white">Detail Order</h3>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">Jenis layanan</p>
              <p className="mt-1 text-sm font-bold text-white">Akun digital</p>
            </div>
          </div>

          <div className="mt-4 space-y-3.5">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Pilih layanan</span>
              <select
                value={selectedProduct?.id || 0}
                onChange={(event) => setSelectedProductId(Number(event.target.value))}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#0f0b15] px-3.5 py-3 text-sm font-semibold text-white outline-none transition focus:border-brand/60"
              >
                {!catalog.length ? <option value={0}>Belum ada produk</option> : null}
                {catalog.map((item) => (
                  <option key={item.id} value={item.id} disabled={Number(item.stock || 0) <= 0}>
                    {item.name} - {formatCurrency(item.final_price)} {Number(item.stock || 0) <= 0 ? '(Belum tersedia)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 rounded-xl border border-white/10 bg-[#0b0f1a] p-3 sm:grid-cols-[88px_1fr]">
              <div className="grid h-20 w-full place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
                {selectedProduct?.image ? (
                  <img src={selectedProduct.image} alt={selectedProduct.name} className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-7 w-7 text-white/30" />
                )}
              </div>
              <div>
                <p className="text-sm font-extrabold text-white">{selectedProduct?.name || '-'}</p>
                <p className="mt-1 text-xs leading-5 text-white/50">{selectedProduct?.note || 'Produk digital siap diproses.'}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.14em]">
                  <span className={`rounded-full border px-2.5 py-1 ${selectedReady ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/20 bg-amber-500/10 text-amber-200'}`}>
                    {selectedReady ? `Tersedia: ${selectedProduct?.stock ?? 0}` : 'Belum tersedia'}
                  </span>
                  <span className="rounded-full border border-brand/20 bg-brand/10 px-2.5 py-1 text-white">{formatCurrency(selectedProduct?.final_price || 0)}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_132px]">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Pengiriman</span>
                <div className="mt-1.5 flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#0f0b15] px-3.5 py-3 text-sm font-semibold text-white">
                  <MessageCircle className="h-4 w-4 text-emerald-300" />
                  WhatsApp akun terdaftar
                </div>
              </label>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Qty</span>
                <div className="mt-1.5 grid grid-cols-3 overflow-hidden rounded-xl border border-white/10 bg-[#0f0b15]">
                  <button type="button" onClick={() => setQty((value) => Math.max(1, value - 1))} className="grid h-[44px] place-items-center text-white/70 transition hover:bg-white/5">
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="grid h-[44px] place-items-center border-x border-white/10 text-sm font-bold text-white">{qty}</div>
                  <button type="button" onClick={() => setQty((value) => value + 1)} className="grid h-[44px] place-items-center text-white/70 transition hover:bg-white/5">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-[#0b0f1a] px-4 py-3.5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Total Tagihan</p>
                  <p className="mt-1 text-xs font-semibold text-emerald-300">{selectedProduct?.name || '-'}</p>
                </div>
                <p className="text-2xl font-black text-white">{formatCurrency(total)}</p>
              </div>
            </div>

            {loading && <p className="text-xs text-white/45">Memuat katalog produk...</p>}
            {error && <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
            {error.toLowerCase().includes('saldo') ? (
              <button
                type="button"
                onClick={() => navigate('/dashboard/deposit-saldo')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-100"
              >
                Deposit Saldo
              </button>
            ) : null}
            {result && <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{result}</div>}
            {directLoading && <div className="rounded-2xl border border-brand/20 bg-brand/10 px-4 py-3 text-sm text-white">Generating QRIS...</div>}
            {lastOrder ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-[#0b0f1a] p-4">
                <p className="text-sm font-extrabold text-white">{lastOrder.product_name || selectedProduct?.name}</p>
                <p className="mt-1 text-xs text-white/50">{lastOrder.description || selectedProduct?.note || 'Pesanan tercatat di Riwayat Pesanan.'}</p>
                <div className="mt-3 grid gap-2 text-sm text-white/70 sm:grid-cols-2">
                  <span>Username: <b className="text-white">{lastOrder.accounts?.[0]?.username || lastOrder.account_data?.email || '-'}</b></span>
                  <span>Password: <b className="text-white">{lastOrder.accounts?.[0]?.password || lastOrder.account_data?.password || '-'}</b></span>
                </div>
              </div>
            ) : null}

            <button
              onClick={submitOrder}
              disabled={ordering || loading || !selectedProduct || !selectedReady}
              className="w-full rounded-xl bg-brand px-5 py-3 text-xs font-extrabold uppercase tracking-[0.16em] text-white shadow-lg shadow-brand/20 transition hover:scale-[1.01] disabled:opacity-60"
            >
              {!selectedReady ? 'Belum tersedia' : ordering ? 'Memproses...' : 'Order Sekarang'}
            </button>
          </div>
        </NeonCard>
      </div>

      <section className="rounded-[1.25rem] border border-emerald-500/20 bg-[linear-gradient(145deg,rgba(16,185,129,0.12),rgba(14,165,233,0.08))] p-4">
        <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
              <Phone className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-white">Masih ada pertanyaan?</h3>
              <p className="mt-1 max-w-lg text-xs leading-5 text-white/55">Konsultasikan kebutuhanmu langsung ke tim kami via WhatsApp.</p>
            </div>
          </div>
          <a
            href={waOrderLink}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex min-w-[220px] items-center justify-center gap-2.5 rounded-xl px-5 py-3 text-sm font-extrabold text-white shadow-lg transition hover:scale-[1.01] ${
              waOrderLink ? 'bg-emerald-500 shadow-emerald-500/20' : 'pointer-events-none bg-white/10 opacity-50'
            }`}
          >
            <MessageCircle className="h-5 w-5" />
            Chat WhatsApp
          </a>
        </div>
      </section>

      {showDirectConfirm ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.35rem] border border-white/10 bg-[#0d0912] p-5 shadow-2xl shadow-brand/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black text-white">Saldo tidak cukup</p>
                <p className="mt-2 text-sm leading-6 text-white/60">Apakah ingin melakukan pembayaran langsung menggunakan QRIS?</p>
              </div>
              <button onClick={() => setShowDirectConfirm(false)} className="rounded-xl border border-white/10 p-2 text-white/60">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <p className="text-xs text-white/45">{selectedProduct?.name}</p>
              <p className="mt-1 text-2xl font-black text-white">{formatCurrency(total)}</p>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button onClick={() => setShowDirectConfirm(false)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/70">
                Tidak
              </button>
              <button onClick={() => void startDirectPayment()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-black text-white shadow-lg shadow-brand/20">
                <CreditCard className="h-4 w-4" />
                Lanjutkan
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {directPayment ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-4">
          <div className="max-h-[90dvh] w-[min(94vw,760px)] overflow-y-auto rounded-[1.4rem] border border-brand/20 bg-[#0d0912] shadow-2xl shadow-brand/20">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-black text-white">QRIS Pembayaran</p>
                <p className="break-all text-xs text-white/40">{directPayment.invoice}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${paymentStatusTone(directStatus)}`}>
                {directStatus}
              </span>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-[210px_minmax(0,1fr)] sm:p-5">
              <div className={`rounded-[1.2rem] border p-3 ${canShowDirectQr ? 'border-white/10 bg-white' : 'border-white/10 bg-white/5'}`}>
                {canShowDirectQr ? (
                  <img src={directQrSource} alt="QRIS" className="mx-auto aspect-square w-full max-w-[220px] rounded-xl object-contain" />
                ) : (
                  <div className="mx-auto grid aspect-square w-full max-w-[220px] place-items-center rounded-xl bg-black/20 px-4 text-center text-sm font-bold text-white/60">
                    {directStatus === 'success'
                      ? 'QR disembunyikan setelah pembayaran sukses'
                      : directStatus === 'expired'
                        ? 'QR sudah expired'
                        : directStatus === 'pending'
                        ? 'QR kedaluwarsa'
                        : 'QR tidak aktif'}
                  </div>
                )}
              </div>
              <div className="min-w-0 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Total bayar</p>
                  <p className="mt-1 text-2xl font-black text-white">{formatCurrency(directPayment.total_bayar || directPayment.amount)}</p>
                  {directPayment.total_bayar && directPayment.total_bayar !== directPayment.amount ? (
                    <p className="mt-1 text-xs font-semibold text-white/45">Harga produk {formatCurrency(directPayment.amount)}</p>
                  ) : null}
                  {directPaymentPending && directPayment.expired_at ? (
                    <p className="mt-2 text-xs font-bold text-amber-200">
                      Berlaku {Math.floor(paymentSecondsLeft / 60)}:{String(paymentSecondsLeft % 60).padStart(2, '0')}
                    </p>
                  ) : null}
                </div>
                {directStatus === 'success' && directPayment.order?.order_status === 'success' ? (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    <p className="font-black">Pesanan berhasil diproses</p>
                    <p className="mt-1">Produk: {directPayment.order.product_name || '-'}</p>
                    <p>Email: {directPayment.order.email_account || '-'}</p>
                    <p>Password: {directPayment.order.password_account || '-'}</p>
                  </div>
                ) : directStatus === 'success' ? (
                  <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
                    <p className="font-black">Pembayaran berhasil</p>
                    <p className="mt-2 leading-6">Pesanan sedang diproses provider. Mohon tunggu sistem mengambil data akun.</p>
                    <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-sky-200">Status: {directPayment.order?.provider_status || directPayment.order?.order_status || 'processing'}</p>
                  </div>
                ) : directStatus === 'expired' ? (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    <p className="font-black">QR sudah expired</p>
                    <p className="mt-2 leading-6">Silakan buat pembayaran baru. QR lama sudah tidak aktif dan tidak akan dicek ulang otomatis.</p>
                  </div>
                ) : directStatus === 'canceled' ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
                    Pembayaran sudah dibatalkan. Buat QR baru jika masih ingin melanjutkan order.
                  </div>
                ) : directStatus === 'failed' ? (
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    Pembayaran gagal. Buat QR baru jika masih ingin mencoba lagi.
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-white/55">Scan QRIS lalu sistem mengecek pembayaran berkala hanya saat status masih pending. Setelah sukses, order dikirim otomatis ke Premku.</p>
                )}
                <div className="grid gap-2">
                  <button onClick={() => void checkDirectPayment()} disabled={!canCheckDirectPayment} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-black text-white disabled:opacity-60">
                    {checkingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Cek Pembayaran
                  </button>
                  {directStatus === 'success' && directPayment.order?.order_status === 'success' ? (
                    <button
                      onClick={() => {
                        sessionStorage.removeItem(directPaymentStorageKey);
                        setDirectPayment(null);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/80"
                    >
                      Tutup
                    </button>
                  ) : directStatus === 'success' ? (
                    <button type="button" disabled className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm font-bold text-sky-100 disabled:opacity-80">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing Provider
                    </button>
                  ) : directPaymentTerminal ? (
                    <>
                      <button
                        type="button"
                        onClick={restartDirectPayment}
                        disabled={directLoading || !selectedReady}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand/30 bg-brand/15 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                      >
                        {directLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                        Buat QR Baru
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sessionStorage.removeItem(directPaymentStorageKey);
                          setDirectPayment(null);
                        }}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/70"
                      >
                        Tutup
                      </button>
                    </>
                  ) : (
                    <button onClick={cancelDirectPayment} disabled={!canCancelDirectPayment} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200 disabled:opacity-50">
                      Batalkan Pembayaran
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
