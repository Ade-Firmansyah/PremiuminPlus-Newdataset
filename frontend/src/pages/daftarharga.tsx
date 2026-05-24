import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Code2, ImageIcon, Tag, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getApiKey } from '../store/useAuth';
import { premiuminApi, type ProductRecord } from '../services/api';
import { formatCurrency } from '../utils/format';

const pageSize = 12;

const getProductGradient = (productCode: string): string => {
  const gradients = [
    'bg-[linear-gradient(135deg,rgba(59,130,246,0.08),rgba(9,10,15,0.94))]', // blue
    'bg-[linear-gradient(135deg,rgba(34,197,94,0.08),rgba(9,10,15,0.94))]', // emerald
    'bg-[linear-gradient(135deg,rgba(168,85,247,0.08),rgba(9,10,15,0.94))]', // purple
    'bg-[linear-gradient(135deg,rgba(236,72,153,0.08),rgba(9,10,15,0.94))]', // pink
    'bg-[linear-gradient(135deg,rgba(79,70,229,0.08),rgba(9,10,15,0.94))]', // indigo
    'bg-[linear-gradient(135deg,rgba(14,165,233,0.08),rgba(9,10,15,0.94))]', // sky
    'bg-[linear-gradient(135deg,rgba(139,92,246,0.08),rgba(9,10,15,0.94))]', // violet
    'bg-[linear-gradient(135deg,rgba(249,115,22,0.08),rgba(9,10,15,0.94))]', // orange
  ];

  let hash = 0;
  const code = productCode || 'default';
  for (let i = 0; i < code.length; i++) {
    hash = ((hash << 5) - hash) + code.charCodeAt(i);
    hash = hash & hash;
  }
  return gradients[Math.abs(hash) % gradients.length];
};

function ProductCard({ product }: { product: ProductRecord }) {
  const ready = product.status === 'active' && product.stock > 0;
  const discountPercent = Number(product.discount_percent ?? 10);
  const label = product.tag || product.code || 'Produk';
  const productGradient = getProductGradient(product.code || product.name || '');

  return (
    <article
      className={[
        'group relative min-h-[232px] overflow-hidden rounded-[1.35rem] border bg-[#090a0f]/90 p-5 transition duration-200',
        'border-white/10 shadow-[0_18px_36px_rgba(0,0,0,0.22)] hover:-translate-y-1 hover:border-brand/45 hover:shadow-[0_0_34px_rgba(255,0,127,0.14)]',
        productGradient,
      ].join(' ')}
    >
      <div className="absolute right-0 top-0 rounded-bl-2xl bg-[linear-gradient(135deg,#ff4f87,#b91552)] px-3 py-2 text-[10px] font-black uppercase text-white shadow-[0_10px_24px_rgba(255,0,96,0.28)]">
        Discount {discountPercent}%
      </div>

      <div className="flex items-start gap-4 pr-20">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          {product.image ? <img src={product.image} alt={product.name} className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-white/30" />}
        </div>
        <span className="mt-3 max-w-[170px] truncate rounded-lg border border-brand/10 bg-brand/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-brand-light">
          {label}
        </span>
      </div>

      <h3 className="mt-5 line-clamp-2 min-h-[52px] text-[19px] font-black leading-tight tracking-tight text-white">{product.name}</h3>
      <p className="mt-2 line-clamp-2 min-h-[40px] text-xs leading-5 text-white/42">{product.note || 'Produk digital aktif dari database Premiumin Pluus.'}</p>

      <div className="mt-3 flex items-end gap-2">
        <p className="text-2xl font-black tracking-tight text-brand-light">{formatCurrency(product.price_sell)}</p>
      </div>

      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between gap-3">
          <span
            className={[
              'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em]',
              ready ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/5 text-white/55',
            ].join(' ')}
          >
            {ready ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> : <X className="h-3 w-3" />}
            {ready ? `Ready: ${product.stock}` : 'Habis'}
          </span>
          {ready ? (
            <Link to="/dashboard/order-akun" className="inline-flex items-center gap-2 text-xs font-black text-white/58 transition group-hover:text-brand-light">
              Beli
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-black text-amber-200">
              Belum tersedia
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export default function DaftarHarga() {
  const [catalog, setCatalog] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const apiKey = getApiKey();

  useEffect(() => {
    const loadCatalog = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await premiuminApi.products(apiKey || undefined);
        setCatalog(response.data);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Gagal memuat katalog.');
      } finally {
        setLoading(false);
      }
    };

    void loadCatalog();
  }, [apiKey]);

  const totalPages = Math.max(1, Math.ceil(catalog.length / pageSize));
  const visibleCatalog = useMemo(() => catalog.slice((page - 1) * pageSize, page * pageSize), [catalog, page]);

  return (
    <div className="daftar-harga space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              Daftar <span className="text-brand-light">Harga</span>
            </h1>
            <Tag className="h-6 w-6 rotate-[-16deg] fill-brand text-brand" />
          </div>
          <p className="mt-2 text-sm font-semibold text-white/55">Harga spesial reseller. Jual kembali, untung berlapis!</p>
        </div>

        <Link
          to="/dashboard/dokumen"
          className="inline-flex w-fit items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-black text-pink-200 transition hover:border-brand/40 hover:bg-brand/10"
        >
          <Code2 className="h-4 w-4 text-brand-light" />
          Dokumentasi API
        </Link>
      </div>

      {loading ? <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/55">Memuat katalog produk...</p> : null}
      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visibleCatalog.map((product) => (
          <ProductCard key={product.id || product.code || product.name} product={product} />
        ))}
      </div>

      {!loading && !visibleCatalog.length && !error ? <p className="text-sm text-white/45">Belum ada produk dari database.</p> : null}

      {totalPages > 1 ? (
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
            {Array.from({ length: Math.min(totalPages, 3) }, (_, index) => index + 1).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPage(item)}
                className={`h-10 min-w-10 rounded-xl px-3 text-sm font-black transition ${
                  page === item ? 'bg-brand text-white shadow-[0_0_20px_rgba(255,0,127,0.25)]' : 'border border-white/10 bg-black/20 text-white/70 hover:bg-white/5'
                }`}
              >
                {item}
              </button>
            ))}
            {totalPages > 3 ? (
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                className="h-10 rounded-xl border border-white/10 bg-black/20 px-4 text-sm font-black text-pink-200 hover:bg-white/5"
              >
                Next »
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

