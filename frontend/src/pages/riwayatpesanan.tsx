import { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { PageHero, PageSection } from './dashboardPageKit';
import { premiuminApi, type OrderRecord } from '../services/api';
import { getApiKey } from '../store/useAuth';
import { formatCurrency } from '../utils/format';

function isProductOrder(order: OrderRecord) {
  const name = String(order.product_name || '').toLowerCase();
  const channel = String(order.channel || '').toLowerCase();
  const type = String(order.transaction_type || 'order').toLowerCase();

  if (type !== 'order') return false;
  if (['qris', 'deposit', 'payment'].includes(channel)) return false;
  if (['qris payment', 'deposit saldo', 'topup saldo', 'top up saldo'].includes(name)) return false;
  return Boolean(order.product_name);
}

export default function RiwayatPesanan() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const apiKey = getApiKey();

  useEffect(() => {
    const loadOrders = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await premiuminApi.transactions(apiKey || undefined);
        setOrders(response.data.filter(isProductOrder));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Gagal memuat riwayat pesanan.');
      } finally {
        setLoading(false);
      }
    };

    void loadOrders();
  }, [apiKey]);

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

          <div className="space-y-3">
            {orders.map((order) => (
              <article key={order.invoice} className="grid gap-3 rounded-[1.2rem] border border-white/10 bg-[#0f0b15] p-4 sm:grid-cols-[76px_1fr]">
                <div className="grid h-16 w-full place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
                  {order.product_image ? (
                    <img src={order.product_image} alt={order.product_name || 'Produk'} className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-white/30" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-extrabold text-white">{order.product_name || 'Produk digital'}</p>
                      <p className="mt-1 text-xs text-white/40">{order.invoice} | {order.created_at || '-'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{formatCurrency(order.total_price || 0)}</p>
                      <span className="mt-1 inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                        {order.status || 'pending'}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-white/55">{order.description || 'Detail produk tersimpan di transaksi.'}</p>
                  <div className="mt-3 grid gap-2 text-xs text-white/60 sm:grid-cols-2">
                    <span>Username: <b className="text-white">{order.accounts?.[0]?.username || order.account_data?.email || '-'}</b></span>
                    <span>Password: <b className="text-white">{order.accounts?.[0]?.password || order.account_data?.password || '-'}</b></span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </PageSection>
      </div>
    </div>
  );
}
