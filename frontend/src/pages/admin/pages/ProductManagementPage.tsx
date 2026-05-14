import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Database, PackagePlus, PencilLine, PlusCircle, Save, Search, Trash2, X } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { formatCurrency } from '../../../utils/format';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type ProductRecord } from '../../../services/api';

type ProductDraft = {
  id?: number;
  name: string;
  code: string;
  tag: string;
  product_type: 'api' | 'manual';
  tipe_produk?: 'api' | 'manual';
  product_source: 'provider' | 'manual' | 'hybrid';
  stock_mode: 'provider' | 'manual' | 'combined';
  price_base: number;
  member_price: number;
  reseller_price: number;
  status: 'active' | 'inactive';
  note: string;
  image: string;
  provider: string;
  premku_id?: number | null;
  is_bot_enabled: boolean;
  is_visible: boolean;
};

const emptyProduct: ProductDraft = {
  name: '',
  code: '',
  tag: '',
  product_type: 'api',
  product_source: 'provider',
  stock_mode: 'provider',
  price_base: 0,
  member_price: 0,
  reseller_price: 0,
  status: 'active',
  note: '',
  image: '',
  provider: 'premku',
  premku_id: null,
  is_bot_enabled: true,
  is_visible: true,
};

function productSource(product?: ProductRecord | ProductDraft | null) {
  if (!product) return 'provider';
  return product.product_source || (product.product_type === 'manual' || product.tipe_produk === 'manual' ? 'manual' : 'provider');
}

function productImage(product: ProductRecord) {
  return product.image || product.thumbnail || product.image_url || '';
}

function toDraft(product: ProductRecord): ProductDraft {
  const source = productSource(product);
  const productType = source === 'manual' ? 'manual' : 'api';
  return {
    id: product.id,
    name: product.name || '',
    code: product.code || '',
    tag: product.tag || product.category || '',
    product_type: productType,
    product_source: source,
    stock_mode: product.stock_mode || (source === 'manual' ? 'manual' : source === 'hybrid' ? 'combined' : 'provider'),
    price_base: Number(product.price_base || product.base_price || 0),
    member_price: Number(product.member_price || product.price_sell || 0),
    reseller_price: Number(product.reseller_price || product.price_sell || 0),
    status: product.status === 'inactive' ? 'inactive' : 'active',
    note: product.note || product.description || '',
    image: product.image || product.thumbnail || product.image_url || '',
    provider: product.provider || (productType === 'manual' ? 'manual' : 'premku'),
    premku_id: product.premku_id || null,
    is_bot_enabled: product.is_bot_enabled !== false,
    is_visible: product.is_visible !== false,
  };
}

export function ProductManagementPage() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [draft, setDraft] = useState<ProductDraft>(emptyProduct);
  const [editing, setEditing] = useState<ProductDraft | null>(null);
  const [deleting, setDeleting] = useState<ProductRecord | null>(null);
  const [stockProduct, setStockProduct] = useState<ProductRecord | null>(null);
  const [stockDraft, setStockDraft] = useState({ email: '', password: '', bulk: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const apiKey = getApiKey();

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

  const payloadFromDraft = (value: ProductDraft) => ({
    name: value.name.trim(),
    nama_produk: value.name.trim(),
    code: value.code.trim(),
    kode_produk: value.code.trim(),
    tag: value.tag.trim(),
    kategori: value.tag.trim(),
    product_source: value.product_source,
    stock_mode: value.stock_mode,
    product_type: value.product_source === 'manual' ? 'manual' : 'api',
    tipe_produk: value.product_source === 'manual' ? 'manual' : 'api',
    provider: value.product_source === 'manual' ? 'manual' : value.provider || 'premku',
    provider_api: value.product_source !== 'manual' ? value.provider || 'premku' : 'manual',
    premku_id: value.product_source !== 'manual' ? value.premku_id || null : null,
    sku_api: value.product_source !== 'manual' ? value.premku_id || null : null,
    price_base: Number(value.price_base || 0),
    harga_base: Number(value.price_base || 0),
    base_price: Number(value.price_base || 0),
    member_price: Number(value.member_price || 0),
    harga_member: Number(value.member_price || 0),
    price_sell: Number(value.member_price || 0),
    reseller_price: Number(value.reseller_price || 0),
    harga_reseller: Number(value.reseller_price || 0),
    status: value.status,
    note: value.note,
    description: value.note,
    deskripsi: value.note,
    image: value.image,
    image_url: value.image,
    thumbnail: value.image,
    is_bot_enabled: value.is_bot_enabled,
    is_visible: value.is_visible,
  });

  const saveProduct = async (value: ProductDraft, mode: 'create' | 'edit') => {
    if (!value.name.trim() || !value.code.trim()) {
      setError('Nama produk dan slug/code produk wajib diisi.');
      return;
    }
    if (Number(value.member_price || 0) <= 0 || Number(value.reseller_price || 0) <= 0) {
      setError('Harga member dan harga reseller wajib lebih dari 0.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (mode === 'edit' && value.id) {
        await premiuminApi.adminUpdateProduct(value.id, payloadFromDraft(value), apiKey || undefined);
        setEditing(null);
        setSuccess('Produk berhasil diperbarui.');
      } else {
        await premiuminApi.adminCreateProduct(payloadFromDraft(value), apiKey || undefined);
        setDraft(emptyProduct);
        setSuccess('Produk berhasil dibuat.');
      }
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan produk.');
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async () => {
    if (!deleting) return;
    setSaving(true);
    setError('');
    try {
      await premiuminApi.adminDeleteProduct(deleting.id, apiKey || undefined);
      setDeleting(null);
      setSuccess('Produk berhasil dihapus/nonaktifkan.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menghapus produk.');
    } finally {
      setSaving(false);
    }
  };

  const addManualStock = async () => {
    if (!stockProduct) return;
    if (!stockDraft.bulk.trim() && (!stockDraft.email.trim() || !stockDraft.password.trim())) {
      setError('Isi stock manual single atau bulk terlebih dahulu.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await premiuminApi.adminAddManualStock(stockProduct.id, stockDraft, apiKey || undefined);
      setStockDraft({ email: '', password: '', bulk: '' });
      setSuccess('Stock manual berhasil ditambahkan.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menambah stock manual.');
    } finally {
      setSaving(false);
    }
  };

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredProducts = normalizedSearch
    ? products.filter((product) =>
        [
          product.name,
          product.code,
          product.tag,
          product.category,
          product.provider,
          product.status,
          product.stock_mode,
          productSource(product),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : products;

  const sourceBadgeClass = (source: string) => {
    if (source === 'manual') return 'border-emerald-300/45 bg-emerald-500/75 text-white shadow-[0_0_14px_rgba(16,185,129,0.35)]';
    if (source === 'hybrid') return 'border-amber-300/45 bg-amber-500/75 text-white shadow-[0_0_14px_rgba(245,158,11,0.35)]';
    return 'border-sky-300/45 bg-sky-500/75 text-white shadow-[0_0_14px_rgba(14,165,233,0.35)]';
  };

  const sourceLabel = (source: string) => {
    if (source === 'manual') return 'Manual Admin';
    if (source === 'hybrid') return 'Hybrid';
    return 'Provider API';
  };

  const ProductForm = ({ value, onChange, onSave }: { value: ProductDraft; onChange: (next: ProductDraft) => void; onSave: () => void }) => (
    <div className="grid gap-3">
      <input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="Nama produk" />
      <input value={value.code} onChange={(event) => onChange({ ...value, code: event.target.value })} className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="Slug / code produk" />
      <input value={value.tag} onChange={(event) => onChange({ ...value, tag: event.target.value })} className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="Kategori" />
      <select value={value.product_source} onChange={(event) => {
        const nextSource = event.target.value as ProductDraft['product_source'];
        onChange({
          ...value,
          product_source: nextSource,
          product_type: nextSource === 'manual' ? 'manual' : 'api',
          stock_mode: nextSource === 'manual' ? 'manual' : nextSource === 'hybrid' ? 'combined' : 'provider',
          provider: nextSource === 'manual' ? 'manual' : 'premku',
        });
      }} className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50">
        <option value="provider">Provider API</option>
        <option value="manual">Produk Manual Admin</option>
        <option value="hybrid">Hybrid Provider + Manual</option>
      </select>
      <select value={value.stock_mode} onChange={(event) => onChange({ ...value, stock_mode: event.target.value as ProductDraft['stock_mode'] })} className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50">
        <option value="provider">Stock Provider</option>
        <option value="manual">Stock Manual</option>
        <option value="combined">Stock Combined</option>
      </select>
      {value.product_source !== 'manual' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={value.provider} onChange={(event) => onChange({ ...value, provider: event.target.value })} className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="Provider API" />
          <input type="number" value={Number(value.premku_id || 0)} onChange={(event) => onChange({ ...value, premku_id: Number(event.target.value) || null })} className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="SKU API" />
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-100">Produk Manual Admin</div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <input type="number" value={Number(value.price_base || 0)} onChange={(event) => onChange({ ...value, price_base: Number(event.target.value) })} className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="Harga base" />
        <input type="number" value={Number(value.member_price || 0)} onChange={(event) => onChange({ ...value, member_price: Number(event.target.value) })} className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="Harga member" />
        <input type="number" value={Number(value.reseller_price || 0)} onChange={(event) => onChange({ ...value, reseller_price: Number(event.target.value) })} className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="Harga reseller" />
      </div>
      <select value={value.status} onChange={(event) => onChange({ ...value, status: event.target.value as ProductDraft['status'] })} className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50">
        <option value="active">active</option>
        <option value="inactive">nonactive</option>
      </select>
      <textarea value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} className="min-h-24 rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="Deskripsi" />
      <input value={value.image} onChange={(event) => onChange({ ...value, image: event.target.value })} className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="Thumbnail / URL gambar" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/80">
          <input type="checkbox" checked={value.is_visible} onChange={(event) => onChange({ ...value, is_visible: event.target.checked })} />
          Tampil di katalog
        </label>
        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/80">
          <input type="checkbox" checked={value.is_bot_enabled} onChange={(event) => onChange({ ...value, is_bot_enabled: event.target.checked })} />
          Aktif di Bot WA
        </label>
      </div>
      <button onClick={onSave} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 disabled:opacity-60">
        <Save className="h-4 w-4" />
        {saving ? 'Menyimpan...' : 'Simpan Produk'}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHero title="Product Management" subtitle="Kelola Produk API dan Produk Manual Admin." slogan="Harga base, member, reseller tanpa switch preview. Stock manual realtime dari database internal." tone="from-brand/15 via-cyan-500/10 to-emerald-500/10" chips={['API Provider', 'Manual Admin', 'Stock realtime']} />
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <PageSection title="Tambah produk" subtitle="Produk digital">
          <ProductForm value={draft} onChange={setDraft} onSave={() => void saveProduct(draft, 'create')} />
          {error ? <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
          {success ? <div className="mt-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}
        </PageSection>
        <PageSection title="Daftar produk" subtitle="Katalog aktif">
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 text-sm text-white/70 focus-within:border-brand/50">
              <Search className="h-4 w-4 shrink-0 text-brand-light" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/35"
                placeholder="Cari nama, kode, kategori, source..."
              />
            </label>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-white/55">
              {filteredProducts.length} / {products.length} produk
            </div>
          </div>

          {loading ? <p className="text-sm text-white/45">Memuat produk...</p> : null}
          <div className="grid gap-3 2xl:grid-cols-2">
            {filteredProducts.map((product) => {
              const source = productSource(product);
              const stock = product.effective_stock ?? product.stock;
              return (
                <NeonCard key={product.id}>
                  <div className="flex h-full flex-col gap-4">
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f1a]">
                      <div className="relative aspect-[16/9] w-full">
                        {productImage(product) ? (
                          <img
                            src={productImage(product)}
                            alt={product.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-brand/15 via-cyan-500/10 to-emerald-500/10">
                            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/10 text-white/70">
                              <PackagePlus className="h-6 w-6" />
                            </div>
                          </div>
                        )}
                        <div className="absolute left-3 top-3">
                          <span className={`inline-flex min-h-7 min-w-[7.5rem] items-center justify-center rounded-full border px-3 py-1 text-center text-[10px] font-black uppercase tracking-[0.14em] backdrop-blur-md ${sourceBadgeClass(source)}`}>{sourceLabel(source)}</span>
                        </div>
                        <div className={`absolute right-3 top-3 min-w-[4.5rem] rounded-2xl border px-3 py-2 text-center backdrop-blur-md shadow-[0_0_14px_rgba(0,0,0,0.28)] ${Number(stock || 0) > 0 ? 'border-emerald-300/45 bg-emerald-500/75' : 'border-rose-300/45 bg-rose-500/75'}`}>
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/80">Stock</p>
                          <p className="text-base font-black text-white">{stock ?? 0}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="max-w-full truncate text-sm font-black text-white">{product.name}</p>
                        </div>
                        <p className="mt-1 truncate text-xs text-white/45">{product.code} | {product.status} | {product.stock_mode || 'provider'}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${product.is_visible === false ? 'border-white/10 bg-white/5 text-white/40' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'}`}>{product.is_visible === false ? 'Hidden' : 'Visible'}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                        <p className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Provider</p>
                        <p className="mt-1 text-center text-sm font-black text-white">{product.provider_stock ?? 0}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                        <p className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Manual</p>
                        <p className="mt-1 text-center text-sm font-black text-white">{product.manual_stock ?? 0}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                        <p className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Bot</p>
                        <p className="mt-1 text-center text-sm font-black text-white">{product.is_bot_enabled === false ? 'Off' : 'On'}</p>
                      </div>
                    </div>

                    <div className="grid gap-2 text-xs text-white/55 sm:grid-cols-3">
                      <span>Base: <b className="text-white">{formatCurrency(product.price_base)}</b></span>
                      <span>Member: <b className="text-brand-light">{formatCurrency(product.member_price || product.price_sell)}</b></span>
                      <span>Reseller: <b className="text-brand-light">{formatCurrency(product.reseller_price || product.price_sell)}</b></span>
                    </div>

                    <div className="mt-auto grid gap-2 sm:grid-cols-3">
                      <button onClick={() => setStockProduct(product)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200"><PlusCircle className="h-3.5 w-3.5" />Stock</button>
                      <button onClick={() => setEditing(toDraft(product))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white"><PencilLine className="h-3.5 w-3.5" />Edit</button>
                      <button onClick={() => setDeleting(product)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200"><Trash2 className="h-3.5 w-3.5" />Hapus</button>
                    </div>
                  </div>
                </NeonCard>
              );
            })}
          </div>
          {!loading && !products.length ? <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/45"><PackagePlus className="mr-2 inline h-4 w-4 text-brand" />Belum ada produk.</div> : null}
          {!loading && products.length > 0 && !filteredProducts.length ? <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/45"><Search className="mr-2 inline h-4 w-4 text-brand" />Produk tidak ditemukan.</div> : null}
        </PageSection>
      </div>
      {editing ? <Modal title="Edit produk" onClose={() => setEditing(null)}><ProductForm value={editing} onChange={setEditing} onSave={() => void saveProduct(editing, 'edit')} />{error ? <p className="mt-3 text-sm text-rose-200">{error}</p> : null}</Modal> : null}
      {stockProduct ? (
        <Modal title="Manual Stock" onClose={() => setStockProduct(null)} subtitle={stockProduct.name}>
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={stockDraft.email} onChange={(event) => setStockDraft((current) => ({ ...current, email: event.target.value }))} className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50" placeholder="Email / username" />
              <input value={stockDraft.password} onChange={(event) => setStockDraft((current) => ({ ...current, password: event.target.value }))} className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50" placeholder="Password" />
            </div>
            <textarea
              value={stockDraft.bulk}
              onChange={(event) => setStockDraft((current) => ({ ...current, bulk: event.target.value }))}
              className="min-h-32 rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/50"
              placeholder={'Bulk import akun manual\nemail1@gmail.com pass1\nemail2@gmail.com:pass2'}
            />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Manual Ready</p>
                <p className="mt-1 text-sm font-black text-white">{stockProduct.manual_stock ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Provider</p>
                <p className="mt-1 text-sm font-black text-white">{stockProduct.provider_stock ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">Total</p>
                <p className="mt-1 text-sm font-black text-white">{stockProduct.effective_stock ?? stockProduct.stock ?? 0}</p>
              </div>
            </div>
            <button onClick={() => void addManualStock()} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 disabled:opacity-60"><Database className="h-4 w-4" />{saving ? 'Menyimpan...' : 'Tambah Stock'}</button>
            {error ? <p className="text-sm text-rose-200">{error}</p> : null}
          </div>
        </Modal>
      ) : null}
      {deleting ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-[1.35rem] border border-rose-500/20 bg-[#0d0912] p-5 shadow-2xl shadow-rose-500/10"><div className="flex gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-200"><AlertTriangle className="h-5 w-5" /></div><div><p className="text-lg font-black text-white">Apakah yakin ingin menghapus produk ini?</p><p className="mt-2 text-sm leading-6 text-white/55">{deleting.name} akan dihapus, atau dinonaktifkan jika sudah punya histori transaksi.</p></div></div><div className="mt-5 grid gap-2 sm:grid-cols-2"><button onClick={() => setDeleting(null)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/70">Batal</button><button onClick={() => void deleteProduct()} disabled={saving} className="rounded-xl border border-rose-500/20 bg-rose-500/15 px-4 py-3 text-sm font-black text-rose-100 disabled:opacity-60">Ya Hapus</button></div></div></div> : null}
    </div>
  );
}

function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[1.35rem] border border-white/10 bg-[#0d0912] p-5 shadow-2xl shadow-brand/20">
        <div className="mb-4 flex items-center justify-between">
          <div><p className="text-lg font-black text-white">{title}</p>{subtitle ? <p className="mt-1 text-xs text-white/45">{subtitle}</p> : null}</div>
          <button onClick={onClose} className="rounded-xl border border-white/10 p-2 text-white/60"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
