import { useEffect, useState } from 'react';
import { ImageIcon, PackagePlus, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { formatCurrency } from '../../../utils/format';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type ProductRecord, type ProductStockItemRecord } from '../../../services/api';
import { SettingMarkupPage } from './SettingMarkupPage';

const emptyProduct = {
  id: 0,
  provider_product_id: '',
  name: '',
  code: '',
  base_price: 0,
  member_price: 0,
  reseller_price: 0,
  stock: 0,
  status: 'active',
  note: '',
  tag: '',
  image: '',
  tutorial_url: '',
  product_source: 'manual',
  admin_margin: 0,
  discount_label_percent: 0,
};

type ProductSource = 'provider' | 'manual' | 'hybrid';

function productImage(product: ProductRecord | Record<string, unknown>) {
  return String((product as ProductRecord).image || (product as any).image_url || '');
}

function readNumber(value: unknown): number {
  return Number(value) || 0;
}

export function ProductManagementPage({ apiKey: sessionApiKey }: { apiKey?: string } = {}) {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [draft, setDraft] = useState<Record<string, unknown>>(emptyProduct);
  const [activeSource, setActiveSource] = useState<ProductSource>('provider');
  const [stockProduct, setStockProduct] = useState<ProductRecord | null>(null);
  const [stockItems, setStockItems] = useState<ProductStockItemRecord[]>([]);
  const [stockDraft, setStockDraft] = useState({ email_account: '', password_account: '', description: '' });
  const [editingStockItem, setEditingStockItem] = useState<ProductStockItemRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const apiKey = sessionApiKey || getApiKey();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const productResponse = await premiuminApi.adminProducts(apiKey || undefined);
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

  const filteredProducts = products.filter((product) => (product.product_source || 'provider') === activeSource);

  const openNewProduct = (source: ProductSource = 'manual') => {
    setDraft({ ...emptyProduct, product_source: source, status: 'active' });
    setActiveSource(source);
    setSuccess('');
    setError('');
    setModalOpen(true);
  };

  const openEditProduct = (product: ProductRecord) => {
    setDraft(product as unknown as Record<string, unknown>);
    setSuccess('');
    setError('');
    setModalOpen(true);
  };

  const openStockItems = async (product: ProductRecord) => {
    setStockProduct(product);
    setStockDraft({ email_account: '', password_account: '', description: '' });
    setEditingStockItem(null);
    setError('');
    try {
      const response = await premiuminApi.adminProductStockItems(product.id, apiKey || undefined);
      setStockItems(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat stok manual.');
    }
  };

  const setField = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));

  const closeModal = () => {
    setModalOpen(false);
    setDraft(emptyProduct);
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
      const savedSource = String(draft.product_source || 'manual') as ProductSource;
      const payload = {
        ...draft,
        member_price: readNumber(draft.reseller_price),
      };
      if (readNumber(draft.id)) {
        await premiuminApi.adminUpdateProduct(readNumber(draft.id), payload, apiKey || undefined);
        setSuccess('Produk berhasil diperbarui.');
      } else if (savedSource === 'manual') {
        await premiuminApi.adminCreateManualProduct(payload, apiKey || undefined);
        setSuccess('Produk manual berhasil dibuat.');
      } else if (savedSource === 'hybrid') {
        await premiuminApi.adminCreateHybridProduct(payload, apiKey || undefined);
        setSuccess('Produk hybrid berhasil dibuat.');
      } else {
        await premiuminApi.adminCreateProduct(payload, apiKey || undefined);
        setSuccess('Produk berhasil dibuat.');
      }
      closeModal();
      setActiveSource(savedSource);
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

  const syncProvider = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await premiuminApi.adminSyncProviderProducts(apiKey || undefined);
      setProducts(response.data);
      setSuccess(`Sinkron provider selesai. ${response.data.length} produk tersedia di database.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal sinkron produk provider.');
    } finally {
      setSaving(false);
    }
  };

  const addStockItem = async () => {
    if (!stockProduct) return;
    if (!stockDraft.email_account.trim() || (!editingStockItem && !stockDraft.password_account.trim())) {
      setError('Email/username dan password akun wajib diisi.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const stockPayload = {
        email_account: stockDraft.email_account,
        description: stockDraft.description,
        ...(stockDraft.password_account.trim() ? { password_account: stockDraft.password_account } : {}),
      };
      const updatedProduct = editingStockItem
        ? await premiuminApi.adminUpdateProductStockItem(stockProduct.id, editingStockItem.id, { ...stockPayload, status: editingStockItem.status }, apiKey || undefined)
        : await premiuminApi.adminAddProductStockItem(stockProduct.id, stockPayload as { email_account: string; password_account: string; description?: string }, apiKey || undefined);
      const response = await premiuminApi.adminProductStockItems(stockProduct.id, apiKey || undefined);
      setStockProduct(updatedProduct.data);
      setStockItems(response.data);
      setStockDraft({ email_account: '', password_account: '', description: '' });
      setEditingStockItem(null);
      setSuccess(editingStockItem ? 'Stock manual diperbarui.' : 'Stock manual ditambahkan.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal tambah stock manual.');
    } finally {
      setSaving(false);
    }
  };

  const editStockItem = (item: ProductStockItemRecord) => {
    if (!['available', 'disabled'].includes(item.status)) {
      setError('Stock yang sudah reserved/used tidak bisa diedit.');
      return;
    }
    setEditingStockItem(item);
    setStockDraft({
      email_account: item.email_account || '',
      password_account: '',
      description: item.description || '',
    });
    setError('');
  };

  const deleteStockItem = async (item: ProductStockItemRecord) => {
    if (!stockProduct) return;
    if (!['available', 'disabled'].includes(item.status)) {
      setError('Stock yang sudah reserved/used tidak bisa dihapus.');
      return;
    }
    if (!window.confirm(`Hapus stock "${item.email_account || item.id}"?`)) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updatedProduct = await premiuminApi.adminDeleteProductStockItem(stockProduct.id, item.id, apiKey || undefined);
      const response = await premiuminApi.adminProductStockItems(stockProduct.id, apiKey || undefined);
      setStockProduct(updatedProduct.data);
      setStockItems(response.data);
      if (editingStockItem?.id === item.id) {
        setEditingStockItem(null);
        setStockDraft({ email_account: '', password_account: '', description: '' });
      }
      setSuccess('Stock manual dihapus.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal hapus stock manual.');
    } finally {
      setSaving(false);
    }
  };

  const disableStockItem = async (item: ProductStockItemRecord) => {
    if (!stockProduct) return;
    if (item.status !== 'available') {
      setError('Hanya stock available yang bisa dinonaktifkan.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updatedProduct = await premiuminApi.adminDisableProductStockItem(stockProduct.id, item.id, apiKey || undefined);
      const response = await premiuminApi.adminProductStockItems(stockProduct.id, apiKey || undefined);
      setStockProduct(updatedProduct.data);
      setStockItems(response.data);
      setSuccess('Stock manual dinonaktifkan.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menonaktifkan stock manual.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHero
        title="Product & Margin"
        subtitle="Kelola produk, stok, harga dasar, margin admin, markup role, discount, dan key Premku."
        slogan="Produk dan pricing adalah satu kesatuan. Admin melihat harga dasar; reseller melihat harga final reseller."
        tone="from-brand/15 via-cyan-500/10 to-emerald-500/10"
        chips={['Product catalog', 'Margin rules', 'Premku sync']}
      />

      <section className="grid gap-3 md:grid-cols-3">
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Produk</p>
          <p className="mt-2 text-2xl font-black text-white">{products.length}</p>
          <p className="mt-2 text-sm text-white/45">Katalog dari database/API.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Markup Reseller</p>
          <p className="mt-2 text-2xl font-black text-sky-200">Aktif</p>
          <p className="mt-2 text-sm text-white/45">Sinkron ke role reseller.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Pricing Mode</p>
          <p className="mt-2 text-2xl font-black text-brand-light">Reseller</p>
          <p className="mt-2 text-sm text-white/45">Dipakai order dan katalog.</p>
        </NeonCard>
      </section>

      <SettingMarkupPage compact apiKey={apiKey} />

      <PageSection title="Daftar produk" subtitle="Gunakan tombol Edit untuk produk, atau Stok untuk menambah akun manual/hybrid">
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
              onClick={() => void syncProvider()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-xs font-bold text-sky-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${saving ? 'animate-spin' : ''}`} />
              Sync Provider
            </button>
            <button
              type="button"
              onClick={() => openNewProduct('manual')}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white shadow-lg shadow-brand/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Manual
            </button>
            <button
              type="button"
              onClick={() => openNewProduct('hybrid')}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Hybrid
            </button>
          </div>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {[
            ['provider', 'Produk Provider'],
            ['manual', 'Produk Manual'],
            ['hybrid', 'Produk Hybrid'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveSource(value as ProductSource)}
              className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${
                activeSource === value ? 'border-brand/40 bg-brand/15 text-white' : 'border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.07]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? <div className="mb-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
        {success ? <div className="mb-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}

        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {filteredProducts.map((product) => {
            const stock = readNumber(product.stock);
            const isAvailable = product.status === 'active' && stock > 0;
            const image = productImage(product);
            return (
              <article
                key={product.id}
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
                    <PriceCell label="Base" value={formatCurrency(product.base_price)} />
                    <PriceCell label={product.product_source === 'hybrid' ? 'Stock aktif' : 'Stok'} value={String(stock)} />
                    <PriceCell label="Reseller" value={formatCurrency(product.reseller_price)} tone="sky" />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white/45">{product.product_source || 'provider'}</span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEditProduct(product)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-brand/20 bg-brand/10 px-3 py-2 text-xs font-bold text-pink-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void openStockItems(product)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200"
                      >
                        Stok
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(product)}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {!loading && !filteredProducts.length ? (
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
          onClose={closeModal}
          onSave={save}
          onField={setField}
        />
      ) : null}
      {stockProduct ? (
        <StockModal
          product={stockProduct}
          items={stockItems}
          draft={stockDraft}
          editingItem={editingStockItem}
          saving={saving}
          onDraft={setStockDraft}
          onSave={addStockItem}
          onCancelEdit={() => {
            setEditingStockItem(null);
            setStockDraft({ email_account: '', password_account: '', description: '' });
          }}
          onEdit={editStockItem}
          onDisable={(item) => void disableStockItem(item)}
          onDelete={(item) => void deleteStockItem(item)}
          onClose={() => setStockProduct(null)}
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
  onClose,
  onSave,
  onField,
}: {
  draft: Record<string, unknown>;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onField: (key: string, value: unknown) => void;
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
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Harga final</p>
              <div className="mt-3 grid gap-2">
                <PriceCell label="Reseller" value={formatCurrency(readNumber(draft.reseller_price))} tone="sky" />
              </div>
            </NeonCard>
          </div>

          <div className="grid gap-3">
            {[
              ['name', 'Nama produk'],
              ['code', 'Kode produk'],
              ['provider_product_id', 'Provider product ID'],
              ['tag', 'Tag'],
              ['image', 'URL foto produk'],
              ['tutorial_url', 'Link tutorial YouTube / panduan pakai'],
            ].map(([key, label]) => (
              <label key={key} className="block">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</span>
                <input
                  value={String(draft[key] || '')}
                  onChange={(event) => onField(key, event.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
                  placeholder={label}
                />
              </label>
            ))}

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['base_price', 'Harga dasar'],
                ['admin_margin', 'Margin admin'],
                ['reseller_price', 'Harga reseller'],
                ['discount_label_percent', 'Label diskon UI'],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</span>
                  <input
                    type="number"
                    min={0}
                    value={readNumber(draft[key])}
                    onChange={(event) => onField(key, readNumber(event.target.value))}
                    className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
                    placeholder={label}
                  />
                </label>
              ))}
            </div>
            {readNumber(draft.reseller_price) <= 0 ? (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100">
                Harga reseller masih 0. Isi manual atau biarkan 0 lalu simpan untuk dihitung ulang dari range markup reseller.
              </div>
            ) : null}

            <select
              value={String(draft.product_source || 'provider')}
              onChange={(event) => onField('product_source', event.target.value)}
              className="rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
            >
              <option value="provider">provider</option>
              <option value="manual">manual</option>
              <option value="hybrid">hybrid</option>
            </select>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['stock', 'Stok'],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">{label}</span>
                  <input
                    type="number"
                    min={0}
                    value={readNumber(draft[key])}
                    onChange={(event) => onField(key, readNumber(event.target.value))}
                    className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
                    placeholder={label}
                  />
                </label>
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

function StockModal({
  product,
  items,
  draft,
  editingItem,
  saving,
  onDraft,
  onSave,
  onCancelEdit,
  onEdit,
  onDisable,
  onDelete,
  onClose,
}: {
  product: ProductRecord;
  items: ProductStockItemRecord[];
  draft: { email_account: string; password_account: string; description: string };
  editingItem: ProductStockItemRecord | null;
  saving: boolean;
  onDraft: (draft: { email_account: string; password_account: string; description: string }) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onEdit: (item: ProductStockItemRecord) => void;
  onDisable: (item: ProductStockItemRecord) => void;
  onDelete: (item: ProductStockItemRecord) => void;
  onClose: () => void;
}) {
  const availableCount = items.filter((item) => item.status === 'available').length;
  const usedCount = items.filter((item) => item.status === 'used').length;
  const disabledCount = items.filter((item) => item.status === 'disabled').length;

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[1.35rem] border border-white/10 bg-[#0b1020] p-5 text-white shadow-2xl shadow-black/40">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200">Manual Stock</p>
            <h2 className="mt-1 text-xl font-black">{product.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <PriceCell label="Source" value={product.product_source || 'manual'} />
          <PriceCell label="Provider stok" value={String(product.product_source === 'provider' ? product.stock : 0)} />
          <PriceCell label="Manual ready" value={String(availableCount)} tone="emerald" />
          <PriceCell label="Terpakai/nonaktif" value={`${usedCount}/${disabledCount}`} tone="sky" />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={draft.email_account}
            onChange={(event) => onDraft({ ...draft, email_account: event.target.value })}
            className="rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
            placeholder="Email / username akun"
          />
          <input
            value={draft.password_account}
            onChange={(event) => onDraft({ ...draft, password_account: event.target.value })}
            className="rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
            placeholder={editingItem ? 'Password baru (kosong = tetap)' : 'Password akun'}
          />
          <textarea
            value={draft.description}
            onChange={(event) => onDraft({ ...draft, description: event.target.value })}
            className="min-h-24 rounded-2xl border border-white/10 bg-[#050816] px-4 py-3 text-sm text-white outline-none focus:border-brand/50 md:col-span-3"
            placeholder="Deskripsi credential, instruksi login, atau catatan pemakaian"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-white disabled:opacity-60">
            {editingItem ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingItem ? 'Simpan Stock' : 'Tambah Stock'}
          </button>
          {editingItem ? (
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white/75 hover:bg-white/10"
            >
              Batal Edit
            </button>
          ) : null}
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-white/38">
              <tr>
                <th className="px-3 py-3">Akun</th>
                <th className="px-3 py-3">Password</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Ref</th>
                <th className="px-3 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-white/10 text-white/70">
                  <td className="px-3 py-3 font-semibold text-white">{item.email_account || '-'}</td>
                  <td className="px-3 py-3 font-mono">{item.password_masked || item.password_account || '-'}</td>
                  <td className="px-3 py-3">{item.status}</td>
                  <td className="px-3 py-3">{item.used_by_order_invoice || item.reserved_by_order_invoice || '-'}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit(item)}
                        disabled={!['available', 'disabled'].includes(item.status)}
                        className="rounded-lg border border-brand/20 bg-brand/10 px-2.5 py-1.5 text-xs font-bold text-pink-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(item)}
                        disabled={!['available', 'disabled'].includes(item.status)}
                        className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-xs font-bold text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Hapus
                      </button>
                      <button
                        type="button"
                        onClick={() => onDisable(item)}
                        disabled={item.status !== 'available'}
                        className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Nonaktif
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length ? <p className="mt-4 text-sm text-white/45">Belum ada stock item.</p> : null}
      </div>
    </div>
  );
}
