import { useEffect, useState } from 'react';
import { ImageIcon, PackagePlus, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { formatCurrency } from '../../../utils/format';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type ProductRecord } from '../../../services/api';
import { SettingMarkupPage } from './SettingMarkupPage';

const emptyProduct = {
  id: 0,
  name: '',
  code: '',
  price_base: 0,
  admin_margin: 0,
  stock: 0,
  status: 'active',
  note: '',
  tag: '',
  image: '',
  member_price: 0,
  reseller_price: 0,
};

function productImage(product: ProductRecord | Record<string, unknown>) {
  return String((product as ProductRecord).image || product.image_url || '');
}

export function ProductManagementPage() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [draft, setDraft] = useState<Record<string, unknown>>(emptyProduct);
  const [modalOpen, setModalOpen] = useState(false);
  const [memberRanges, setMemberRanges] = useState<MarkupRangeRecord[]>([]);
  const [resellerRanges, setResellerRanges] = useState<MarkupRangeRecord[]>([]);
  const [markupType, setMarkupType] = useState<'fixed' | 'percent'>('percent');
  const [memberMarkup, setMemberMarkup] = useState(0);
  const [resellerMarkup, setResellerMarkup] = useState(0);
  const [previewRole, setPreviewRole] = useState<'member' | 'reseller'>('member');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const apiKey = getApiKey();

  /**
   * REMOVED: Frontend price calculations
   * 
   * PRICING RULE: Backend calculates ONCE, Frontend renders ONLY.
   * 
   * Products now have pre-calculated member_price and reseller_price
   * stored in the database. Frontend simply displays these values.
   */

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const productResponse = await premiuminApi.products(apiKey || undefined);
      setProducts(productResponse.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat produk.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [apiKey]);

  useEffect(() => {
    const refreshPricingPreview = () => void load();
    window.addEventListener('premiuminplus:pricing-updated', refreshPricingPreview);
    return () => window.removeEventListener('premiuminplus:pricing-updated', refreshPricingPreview);
  }, [apiKey]);

  /**
   * Display role-based price from database
   */
  const getDisplayPrice = (product: ProductRecord) => {
    return previewRole === 'reseller' ? product.reseller_price : product.member_price;
  };

  const openNewProduct = () => {
    setDraft(emptyProduct);
    setPreviewRole('member');
    setSuccess('');
    setError('');
    setModalOpen(true);
  };

  const openEditProduct = (product: ProductRecord) => {
    setDraft(product as unknown as Record<string, unknown>);
    setPreviewRole('member');
    setSuccess('');
    setError('');
    setModalOpen(true);
  };

  const setField = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));

  const closeModal = () => {
    setModalOpen(false);
    setDraft(emptyProduct);
    setPreviewRole('member');
  };

  const save = async () => {
    if (!String(draft.name || '').trim() || !String(draft.code || '').trim()) {
      setError('Nama dan kode produk wajib diisi.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (readNumber(draft.id)) {
        await premiuminApi.adminUpdateProduct(readNumber(draft.id), draft, apiKey || undefined);
        setSuccess('Produk berhasil diperbarui.');
      } else {
        await premiuminApi.adminCreateProduct(draft, apiKey || undefined);
        setSuccess('Produk berhasil dibuat.');
      }
      closeModal();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan produk.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (product: ProductRecord) => {
    if (!window.confirm(`Hapus/nonaktifkan produk "${product.name}"?`)) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await premiuminApi.adminDeleteProduct(product.id, apiKey || undefined);
      setSuccess('Produk berhasil dihapus atau dinonaktifkan.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menghapus produk.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHero
        title="Product & Margin"
        subtitle="Kelola produk, stok, harga dasar, margin admin, markup role, discount, dan key Premku."
        slogan="Produk dan pricing adalah satu kesatuan. Admin melihat harga dasar; user hanya melihat harga final Anggota atau Reseller."
        tone="from-brand/15 via-cyan-500/10 to-emerald-500/10"
        chips={['Product catalog', 'Margin rules', 'Premku sync']}
      />

      <section className="grid gap-3 md:grid-cols-4">
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Produk</p>
          <p className="mt-2 text-2xl font-black text-white">{products.length}</p>
          <p className="mt-2 text-sm text-white/45">Katalog dari database/API.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Markup Anggota</p>
          <p className="mt-2 text-2xl font-black text-emerald-200">{memberRanges.length ? `${memberRanges[0].percent}%+` : `${memberMarkup}%`}</p>
          <p className="mt-2 text-sm text-white/45">Range anggota aktif.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Markup Reseller</p>
          <p className="mt-2 text-2xl font-black text-sky-200">{resellerRanges.length ? `${resellerRanges[0].percent}%+` : `${resellerMarkup}%`}</p>
          <p className="mt-2 text-sm text-white/45">Sinkron ke role reseller.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Pricing Mode</p>
          <p className="mt-2 text-2xl font-black text-brand-light">{markupType}</p>
          <p className="mt-2 text-sm text-white/45">Dipakai order dan katalog.</p>
        </NeonCard>
      </section>

      <SettingMarkupPage compact />

      <PageSection title="Daftar produk" subtitle="Klik kartu untuk edit produk">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {loading ? <p className="text-sm text-white/45">Memuat produk...</p> : <p className="text-sm text-white/45">{products.length} produk dari database/API.</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={openNewProduct}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white shadow-lg shadow-brand/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Produk
            </button>
          </div>
        </div>

        {error ? <div className="mb-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
        {success ? <div className="mb-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}

        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {products.map((product) => {
            const stock = readNumber(product.stock);
            const isAvailable = product.status === 'active' && stock > 0;
            const image = productImage(product);
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => openEditProduct(product)}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] text-left shadow-[0_16px_36px_rgba(0,0,0,0.16)] transition hover:-translate-y-0.5 hover:border-brand/35 hover:bg-white/[0.07]"
              >
                <div className="aspect-[16/9] border-b border-white/10 bg-[#050816]">
                  {image ? (
                    <img src={image} alt={product.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                  ) : (
                    <div className="grid h-full place-items-center bg-[linear-gradient(135deg,rgba(255,47,146,0.12),rgba(168,85,247,0.10))]">
                      <ImageIcon className="h-8 w-8 text-white/35" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{product.name}</p>
                      <p className="mt-1 truncate text-xs text-white/40">{product.code}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                        isAvailable ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                      }`}
                    >
                      {isAvailable ? 'Tersedia' : 'Kosong'}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <PriceCell label="Base" value={formatCurrency(product.price_base)} />
                    <PriceCell label="Stok" value={String(stock)} />
                    <PriceCell label="Anggota" value={formatCurrency(product.member_price || 0)} tone="emerald" />
                    <PriceCell label="Reseller" value={formatCurrency(product.reseller_price || 0)} tone="sky" />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white/45">Klik untuk edit produk</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void remove(product);
                      }}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus
                    </button>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {!loading && !products.length ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/45">
            <PackagePlus className="mr-2 inline h-4 w-4 text-brand" />
            Belum ada produk.
          </div>
        ) : null}
      </PageSection>

      {modalOpen ? (
        <ProductModal
          draft={draft}
          saving={saving}
          previewRole={previewRole}
          finalPrice={finalPrice}
          onClose={closeModal}
          onSave={save}
          onField={setField}
          onPreviewRole={setPreviewRole}
        />
      ) : null}
    </div>
  );
}

function PriceCell({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'emerald' | 'sky' }) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-500/15 bg-emerald-500/5 text-emerald-100'
      : tone === 'sky'
        ? 'border-sky-500/15 bg-sky-500/5 text-sky-100'
        : 'border-white/10 bg-black/15 text-white';
  return (
    <div className={`rounded-2xl border px-3 py-2.5 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</p>
      <p className="mt-1 truncate text-sm font-black">{value}</p>
    </div>
  );
}

function ProductModal({
  draft,
  saving,
  previewRole,
  finalPrice,
  onClose,
  onSave,
  onField,
  onPreviewRole,
}: {
  draft: Record<string, unknown>;
  saving: boolean;
  previewRole: 'member' | 'reseller';
  finalPrice: { roleMargin: number; finalPrice: number };
  onClose: () => void;
  onSave: () => void;
  onField: (key: string, value: unknown) => void;
  onPreviewRole: (role: 'member' | 'reseller') => void;
}) {
  const image = productImage(draft);
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.35rem] border border-white/10 bg-[#0b1020] p-5 text-white shadow-2xl shadow-black/40">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brand-light">{readNumber(draft.id) ? 'Edit Produk' : 'Tambah Produk'}</p>
            <h2 className="mt-1 text-xl font-black">{readNumber(draft.id) ? String(draft.name || 'Produk') : 'Produk baru'}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <div>
            <div className="aspect-square overflow-hidden rounded-2xl border border-white/10 bg-[#050816]">
              {image ? (
                <img src={image} alt={String(draft.name || 'Produk')} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center bg-[linear-gradient(135deg,rgba(255,47,146,0.12),rgba(168,85,247,0.10))]">
                  <ImageIcon className="h-10 w-10 text-white/35" />
                </div>
              )}
            </div>
            <NeonCard className="mt-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Harga {previewRole === 'member' ? 'anggota' : 'reseller'}</p>
              <p className="mt-2 text-2xl font-black text-white">
                {formatCurrency(previewRole === 'member' ? (draft.member_price as number) || 0 : (draft.reseller_price as number) || 0)}
              </p>
              <p className="mt-2 text-xs text-white/45">Stored price (from database)</p>
            </NeonCard>
          </div>

          <div className="grid gap-3">
            {[
              ['name', 'Nama produk'],
              ['code', 'Kode produk'],
              ['tag', 'Tag'],
              ['image', 'URL foto produk'],
            ].map(([key, label]) => (
              <input
                key={key}
                value={String(draft[key] || '')}
                onChange={(event) => onField(key, event.target.value)}
                className="rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
                placeholder={label}
              />
            ))}

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['price_base', 'Harga dasar'],
                ['admin_margin', 'Margin admin'],
                ['stock', 'Stok'],
              ].map(([key, label]) => (
                <input
                  key={key}
                  type="number"
                  min={0}
                  value={readNumber(draft[key])}
                  onChange={(event) => onField(key, readNumber(event.target.value))}
                  className="rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
                  placeholder={label}
                />
              ))}
            </div>

            <select
              value={String(draft.status || 'active')}
              onChange={(event) => onField('status', event.target.value)}
              className="rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>

            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-[#050816] p-2">
              {[
                ['member', 'Anggota'],
                ['reseller', 'Reseller'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onPreviewRole(value as 'member' | 'reseller')}
                  className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${
                    previewRole === value ? 'bg-brand text-white shadow-lg shadow-brand/20' : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <textarea
              value={String(draft.note || '')}
              onChange={(event) => onField('note', event.target.value)}
              className="min-h-24 rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Catatan produk"
            />

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <button
                onClick={onSave}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Menyimpan...' : 'Simpan Produk'}
              </button>
              <button type="button" onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/70 hover:bg-white/10">
                Batal
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
