import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Code2, ExternalLink, ImageIcon, Tag, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getApiKey } from '../store/useAuth';
import { premiuminApi, type ProductRecord } from '../services/api';
import { formatCurrency } from '../utils/format';

const pageSize = 12;
const roleLabel: Record<string, string> = {
  reseller: 'reseller',
  admin: 'admin',
};

const fallbackPalettes = [
  { glow: 'rgba(255,0,127,0.18)', soft: 'rgba(255,0,127,0.10)', border: 'rgba(255,79,135,0.28)' },
  { glow: 'rgba(16,185,129,0.16)', soft: 'rgba(16,185,129,0.09)', border: 'rgba(52,211,153,0.25)' },
  { glow: 'rgba(14,165,233,0.16)', soft: 'rgba(14,165,233,0.09)', border: 'rgba(56,189,248,0.25)' },
  { glow: 'rgba(168,85,247,0.17)', soft: 'rgba(168,85,247,0.09)', border: 'rgba(192,132,252,0.25)' },
  { glow: 'rgba(245,158,11,0.16)', soft: 'rgba(245,158,11,0.08)', border: 'rgba(251,191,36,0.24)' },
];

function hashText(value = '') {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
}

function productPalette(product: ProductRecord) {
  const value = `${product.name} ${product.code} ${product.tag}`.toLowerCase();
  if (value.includes('spotify')) return { glow: 'rgba(30,215,96,0.20)', soft: 'rgba(30,215,96,0.10)', border: 'rgba(30,215,96,0.28)' };
  if (value.includes('prime') || value.includes('zoom')) return { glow: 'rgba(0,168,225,0.18)', soft: 'rgba(0,168,225,0.09)', border: 'rgba(56,189,248,0.25)' };
  if (value.includes('nitro') || value.includes('canva')) return { glow: 'rgba(139,92,246,0.18)', soft: 'rgba(139,92,246,0.09)', border: 'rgba(167,139,250,0.26)' };
  if (value.includes('viu') || value.includes('wetv')) return { glow: 'rgba(245,158,11,0.18)', soft: 'rgba(245,158,11,0.09)', border: 'rgba(251,191,36,0.24)' };
  if (value.includes('capcut') || value.includes('grok') || value.includes('chatgpt')) return { glow: 'rgba(255,0,127,0.20)', soft: 'rgba(255,0,127,0.10)', border: 'rgba(255,79,135,0.30)' };
  return fallbackPalettes[hashText(value) % fallbackPalettes.length];
}

function getBadgeStyle(provider: string) {
  const styles: Record<string, { bg: string; border: string; text: string }> = {
    manual: {
      bg: 'linear-gradient(90deg, rgba(34,197,234,0.15), rgba(6,182,212,0.15))',
      border: '1px solid rgba(34,197,234,0.35)',
      text: '#a5f3fc',
    },
    hybrid: {
      bg: 'linear-gradient(90deg, rgba(34,197,234,0.15), rgba(52,211,153,0.15))',
      border: '1px solid rgba(52,211,153,0.35)',
      text: '#86efac',
    },
    provider: {
      bg: 'linear-gradient(90deg, rgba(236,72,153,0.15), rgba(168,85,247,0.15))',
      border: '1px solid rgba(236,72,153,0.35)',
      text: '#f8bef8',
    },
  };

  return styles[provider?.toLowerCase()] || styles.provider;
}

function ProductCard({ product, role }: { product: ProductRecord; role: string }) {
  const ready = product.status === 'active' && product.stock > 0;
  const label = product.tag || product.code || 'Produk';
  const palette = productPalette(product);
  const discountPercent = role === 'admin' ? 0 : Math.max(0, Math.min(99, Number(product.discount_label_percent || 0)));
  const displayPrice = Number(product.final_price || 0);
  const fakeOriginalPrice = discountPercent > 0 ? Math.ceil(displayPrice / (1 - discountPercent / 100) / 100) * 100 : 0;
  const cardStyle = {
    '--product-glow': palette.glow,
    '--product-soft': palette.soft,
    '--product-border': palette.border,
  } as CSSProperties;

  const provider = product.product_source || 'provider';
  const badgeStyle = getBadgeStyle(provider);
  const badgeText = discountPercent > 0 ? `• DISKON ${discountPercent}%` : provider.toUpperCase();

  return (
    <article
      style={cardStyle}
      className={[
        'group relative min-h-[232px] overflow-hidden rounded-[1.35rem] border border-[color:var(--product-border)] bg-[radial-gradient(circle_at_12%_0%,var(--product-glow),transparent_13rem),linear-gradient(145deg,var(--product-soft),rgba(9,10,15,0.94)_54%,rgba(9,10,15,0.98))] p-5 transition duration-200',
        'shadow-[0_18px_36px_rgba(0,0,0,0.22)] hover:-translate-y-1 hover:border-brand/45 hover:shadow-[0_0_34px_rgba(255,0,127,0.14)]',
      ].join(' ')}
    >
      <div
        className="absolute right-4 top-4 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] backdrop-blur-sm"
        style={{
          background: badgeStyle.bg,
          border: badgeStyle.border,
          color: badgeStyle.text,
        }}
      >
        {badgeText}
      </div>
      <div className="flex items-start gap-4 pr-32">
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          {product.image ? <img src={product.image} alt={product.name} className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-white/30" />}
        </div>
        <span className="mt-3 max-w-[170px] truncate rounded-lg border border-brand/10 bg-brand/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-brand-light">
          {label}
        </span>
      </div>

      <h3 className="mt-5 line-clamp-2 min-h-[52px] text-[19px] font-black leading-tight tracking-tight text-white">{product.name}</h3>
      <p className="mt-2 line-clamp-2 min-h-[40px] text-xs leading-5 text-white/42">{product.note || 'Produk digital aktif dari database Premiumin Plus.'}</p>
      {product.tutorial_url ? (
        <a
          href={product.tutorial_url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-sky-400/15 bg-sky-400/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-sky-100"
        >
          Tutorial
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <p className="text-2xl font-black tracking-tight text-brand-light">{formatCurrency(displayPrice)}</p>
        {fakeOriginalPrice > displayPrice ? <p className="pb-1 text-xs font-bold text-white/35 line-through">{formatCurrency(fakeOriginalPrice)}</p> : null}
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
            <Link to={`/dashboard/order-akun?product_id=${product.id}`} className="inline-flex items-center gap-2 text-xs font-black text-white/58 transition group-hover:text-brand-light">
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
  const [role, setRole] = useState('reseller');
  const apiKey = getApiKey();

  useEffect(() => {
    const loadCatalog = async () => {
      setLoading(true);
      setError('');

      try {
        const [response, meResponse] = await Promise.all([
          premiuminApi.products(apiKey || undefined),
          premiuminApi.me(apiKey || undefined),
        ]);
        setCatalog(response.data);
        setRole(meResponse.data.role);
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
          <p className="mt-2 text-sm font-semibold text-white/55">
            Harga {roleLabel[role] || 'akun'} mengikuti markup admin sesuai role. Margin bot pribadi dihitung terpisah di Bot Wa Setting.
          </p>
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
          <ProductCard key={product.id || product.code || product.name} product={product} role={role} />
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
