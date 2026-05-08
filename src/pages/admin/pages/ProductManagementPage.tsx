import { useEffect, useMemo, useState } from 'react';
import { PackagePlus, PencilLine, RefreshCw, Save, Trash2 } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { formatCurrency } from '../../../utils/format';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type ProductRecord } from '../../../services/api';

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
};

function readNumber(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

export function ProductManagementPage() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [draft, setDraft] = useState<Record<string, unknown>>(emptyProduct);
  const [memberMarkup, setMemberMarkup] = useState(0);
  const [resellerMarkup, setResellerMarkup] = useState(0);
  const [markupType, setMarkupType] = useState<'fixed' | 'percent'>('percent');
  const [previewRole, setPreviewRole] = useState<'member' | 'reseller'>('member');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const apiKey = getApiKey();

  const rolePrice = (base: number, adminMargin: number, role: 'member' | 'reseller') => {
    const subtotal = readNumber(base) + readNumber(adminMargin);
    const markup = role === 'member' ? memberMarkup : resellerMarkup;
    const roleMargin = markupType === 'fixed' ? markup : Math.round((subtotal * markup) / 100);
    return {
      subtotal,
      roleMargin,
      finalPrice: subtotal + roleMargin,
    };
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [productResponse, markupResponse] = await Promise.all([
        premiuminApi.products(apiKey || undefined),
        premiuminApi.markup(apiKey || undefined),
      ]);
      setProducts(productResponse.data);
      setMemberMarkup(markupResponse.data.member_markup ?? markupResponse.data.markup ?? 0);
      setResellerMarkup(markupResponse.data.reseller_markup ?? 0);
      setMarkupType(markupResponse.data.markup_type || 'percent');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat produk.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [apiKey]);

  const finalPrice = useMemo(
    () => rolePrice(readNumber(draft.price_base), readNumber(draft.admin_margin), previewRole),
    [draft, memberMarkup, resellerMarkup, markupType, previewRole],
  );

  const setField = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));

  const resetDraft = () => {
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
      resetDraft();
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
      if (readNumber(draft.id) === product.id) {
        resetDraft();
      }
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
        title="Product Management"
        subtitle="Kelola produk, stok, harga dasar, dan margin admin."
        slogan="Admin melihat harga dasar. User hanya melihat harga final Anggota atau Reseller."
        tone="from-brand/15 via-cyan-500/10 to-emerald-500/10"
        chips={['Base admin', 'Harga anggota', 'Harga reseller']}
      />

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <PageSection title={readNumber(draft.id) ? 'Edit produk' : 'Tambah produk'} subtitle="Produk digital">
          <div className="grid gap-3">
            {[
              ['name', 'Nama produk'],
              ['code', 'Kode produk'],
              ['tag', 'Tag'],
              ['image', 'URL gambar'],
            ].map(([key, label]) => (
              <input
                key={key}
                value={String(draft[key] || '')}
                onChange={(event) => setField(key, event.target.value)}
                className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
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
                  onChange={(event) => setField(key, readNumber(event.target.value))}
                  className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
                  placeholder={label}
                />
              ))}
            </div>

            <select
              value={String(draft.status || 'active')}
              onChange={(event) => setField('status', event.target.value)}
              className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>

            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-[#0b0f1a] p-2">
              {[
                ['member', 'Anggota'],
                ['reseller', 'Reseller'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPreviewRole(value as 'member' | 'reseller')}
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
              onChange={(event) => setField('note', event.target.value)}
              className="min-h-28 rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Catatan produk"
            />

            <NeonCard>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
                Preview harga {previewRole === 'member' ? 'anggota' : 'reseller'}
              </p>
              <p className="mt-2 text-2xl font-black text-white">{formatCurrency(finalPrice.finalPrice)}</p>
              <div className="mt-3 grid gap-2 text-xs text-white/50 sm:grid-cols-3">
                <span>
                  Base: <b className="text-white">{formatCurrency(readNumber(draft.price_base))}</b>
                </span>
                <span>
                  Margin admin: <b className="text-white">{formatCurrency(readNumber(draft.admin_margin))}</b>
                </span>
                <span>
                  Margin role: <b className="text-white">{formatCurrency(finalPrice.roleMargin)}</b>
                </span>
              </div>
            </NeonCard>

            {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
            {success ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Menyimpan...' : readNumber(draft.id) ? 'Simpan Perubahan' : 'Simpan Produk'}
              </button>
              {readNumber(draft.id) ? (
                <button
                  type="button"
                  onClick={resetDraft}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/70 hover:bg-white/10"
                >
                  Batal Edit
                </button>
              ) : null}
            </div>
          </div>
        </PageSection>

        <PageSection title="Daftar produk" subtitle="Katalog aktif">
          <div className="mb-3 flex items-center justify-between gap-3">
            {loading ? <p className="text-sm text-white/45">Memuat produk...</p> : <p className="text-sm text-white/45">{products.length} produk dari database/API.</p>}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          <div className="space-y-3">
            {products.map((product) => {
              const stock = readNumber(product.stock);
              const isAvailable = product.status === 'active' && stock > 0;
              return (
                <NeonCard key={product.id}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black text-white">{product.name}</p>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                            isAvailable
                              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                              : 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                          }`}
                        >
                          {isAvailable ? 'Tersedia' : 'Belum tersedia'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-white/45">
                        {product.code} | stok {stock} | {product.status}
                      </p>
                      <div className="mt-2 grid gap-2 text-xs text-white/55 sm:grid-cols-3">
                        <span>
                          Base: <b className="text-white">{formatCurrency(product.price_base)}</b>
                        </span>
                        <span>
                          Anggota: <b className="text-brand-light">{formatCurrency(rolePrice(product.price_base, product.admin_margin || 0, 'member').finalPrice)}</b>
                        </span>
                        <span>
                          Reseller: <b className="text-brand-light">{formatCurrency(rolePrice(product.price_base, product.admin_margin || 0, 'reseller').finalPrice)}</b>
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(product as unknown as Record<string, unknown>);
                          setSuccess('');
                          setError('');
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(product)}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Hapus
                      </button>
                    </div>
                  </div>
                </NeonCard>
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
      </div>
    </div>
  );
}
