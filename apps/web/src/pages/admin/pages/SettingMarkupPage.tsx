import { useEffect, useMemo, useState } from 'react';
import { Calculator, Percent, Save } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { formatCurrency } from '../../../utils/format';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type MarkupRangeRecord, type MarkupSettingRecord, type ProductRecord } from '../../../services/api';

const defaultRanges: MarkupRangeRecord[] = [
  { min: 0, max: 4999, percent: 18 },
  { min: 5000, max: 9999, percent: 14 },
  { min: 10000, max: 14999, percent: 12 },
  { min: 15000, max: 19999, percent: 11 },
  { min: 20000, max: null, percent: 10 },
];

function rangePercent(price: number, ranges: MarkupRangeRecord[]) {
  const match = ranges.find((range) => price >= Number(range.min || 0) && (range.max === null || price <= Number(range.max)));
  return Number(match?.percent || 0);
}

export function SettingMarkupPage({ compact = false, apiKey: sessionApiKey }: { compact?: boolean; apiKey?: string }) {
  const [resellerRanges, setResellerRanges] = useState<MarkupRangeRecord[]>(defaultRanges.map((range) => ({ ...range, percent: Math.max(0, range.percent - 4) })));
  const [markupType, setMarkupType] = useState<MarkupSettingRecord['markup_type']>('percent');
  const [markup, setMarkup] = useState(0);
  const [resellerMarkup, setResellerMarkup] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(10);
  const [premkuKey, setPremkuKey] = useState('');
  const [premkuKeyMasked, setPremkuKeyMasked] = useState('');
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const apiKey = sessionApiKey || getApiKey();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const [markupResponse, keyResponse, productResponse] = await Promise.all([
          premiuminApi.markup(apiKey || undefined),
          premiuminApi.premkuKey(apiKey || undefined),
          premiuminApi.products(apiKey || undefined),
        ]);
        const discountResponse = await premiuminApi.discount(apiKey || undefined);

        setResellerRanges(markupResponse.data.reseller_markup_ranges?.length ? markupResponse.data.reseller_markup_ranges : defaultRanges.map((range) => ({ ...range, percent: Math.max(0, range.percent - 4) })));
        setMarkupType(markupResponse.data.markup_type);
        setMarkup(markupResponse.data.markup ?? 0);
        setResellerMarkup(markupResponse.data.reseller_markup ?? 0);
        setDiscountPercent(discountResponse.data.discount_percent);
        setPremkuKeyMasked(keyResponse.data.masked);
        setProducts(productResponse.data);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Gagal memuat setting markup.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [apiKey]);

  const previews = useMemo(() => {
    return products.slice(0, 5).map((item: ProductRecord) => {
      const price = (item as any).price_base;
      const resellerPercent = rangePercent(price, resellerRanges);
      const resellerFinalPrice = price + Math.round((price * resellerPercent) / 100);
      return {
        price,
        resellerFinalPrice,
        resellerDelta: resellerFinalPrice - price,
        resellerPercent,
      };
    });
  }, [products, resellerRanges]);

  const saveMarkup = async () => {
    setSaving(true);
    setError('');

    try {
      const response = await premiuminApi.updateMarkup({
        markup,
        reseller_markup: resellerMarkup,
        reseller_markup_ranges: resellerRanges,
        markup_type: markupType,
      }, apiKey || undefined);
      setResellerRanges(response.data.reseller_markup_ranges?.length ? response.data.reseller_markup_ranges : resellerRanges);
      setMarkupType(response.data.markup_type);
      setMarkup(response.data.markup ?? markup);
      setResellerMarkup(response.data.reseller_markup ?? resellerMarkup);
      window.dispatchEvent(new Event('premiuminplus:pricing-updated'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan markup.');
    } finally {
      setSaving(false);
    }
  };

  const updateRange = (index: number, percent: number) => {
    setResellerRanges((current) => current.map((range, rangeIndex) => (rangeIndex === index ? { ...range, percent: Math.max(0, Number(percent || 0)) } : range)));
  };

  const savePremkuKey = async () => {
    setSaving(true);
    setError('');

    try {
      const response = await premiuminApi.updatePremkuKey(premkuKey, apiKey || undefined);
      setPremkuKey('');
      setPremkuKeyMasked(response.data.masked);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan API key Premku.');
    } finally {
      setSaving(false);
    }
  };

  const saveDiscount = async () => {
    setSaving(true);
    setError('');

    try {
      const response = await premiuminApi.updateDiscount({ discount_percent: discountPercent }, apiKey || undefined);
      setDiscountPercent(response.data.discount_percent);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan discount.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {!compact ? (
        <PageHero
          title="Setting Markup"
          subtitle="Markup reseller menjadi satu-satunya source of truth harga jual Premiumin Plus."
          slogan="Semua akun non-admin adalah reseller dan memakai harga reseller."
          tone="from-amber-500/15 via-brand/10 to-sky-500/10"
          chips={['Markup reseller', 'DB sync', 'Reseller only']}
        />
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Mode</p>
          <p className="mt-2 text-2xl font-black text-white">{markupType}</p>
          <p className="mt-2 text-sm text-white/45">Percent direkomendasikan untuk pricing otomatis.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Fallback Reseller</p>
          <p className="mt-2 text-2xl font-black text-sky-200">{resellerMarkup}%</p>
          <p className="mt-2 text-sm text-white/45">Harga dasar reseller sebelum personal margin.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Discount Label</p>
          <p className="mt-2 text-2xl font-black text-white">{discountPercent}%</p>
          <p className="mt-2 text-sm text-white/45">Tampil di kartu daftar harga.</p>
        </NeonCard>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <PageSection title="Atur markup reseller" subtitle="Harga reseller sinkron ke Product API">
          <div className="space-y-3">
            <NeonCard>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Tipe Markup</span>
                  <select
                    value={markupType}
                    onChange={(event) => setMarkupType(event.target.value as MarkupSettingRecord['markup_type'])}
                    className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none"
                  >
                    <option value="percent">percent</option>
                    <option value="fixed">fixed</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Fallback Reseller</span>
                  <input
                    type="number"
                    min={0}
                    value={resellerMarkup}
                    onChange={(event) => setResellerMarkup(Number(event.target.value || 0))}
                    className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none"
                  />
                </label>
              </div>
              <p className="mt-3 text-xs leading-5 text-white/45">
                Rumus produksi: harga final = modal produk + margin admin + markup reseller. Personal margin bot dihitung terpisah dari profil reseller.
              </p>
            </NeonCard>

            <div className="rounded-[1.15rem] border border-white/10 bg-[#0f0b15] p-4">
              <div className="mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200">Range Markup Reseller</p>
                  <div className="mt-2 space-y-2">
                    {resellerRanges.map((range, index) => (
                      <label key={`${range.min}-${range.max ?? 'up'}-reseller`} className="grid grid-cols-[1fr_90px] items-center gap-2 text-xs text-white/60">
                        <span>{formatCurrency(range.min)} - {range.max === null ? 'seterusnya' : formatCurrency(range.max)}</span>
                        <input
                          type="number"
                          value={range.percent}
                          onChange={(event) => updateRange(index, Number(event.target.value))}
                          className="rounded-xl border border-white/10 bg-[#0b0f1a] px-3 py-2 text-sm text-white outline-none"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-white/45">
                  {markupType === 'fixed'
                    ? 'Harga jual = base + markup reseller'
                    : 'Range markup menjadi source of truth harga reseller.'}
                </p>
                <button
                  type="button"
                  onClick={saveMarkup}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/20 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Menyimpan...' : 'Simpan perubahan'}
                </button>
              </div>
            </div>

            <div className="grid gap-3">
              {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
              {loading ? <p className="text-sm text-white/45">Memuat setting...</p> : null}

              <NeonCard>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Discount Daftar Harga</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={discountPercent}
                    onChange={(event) => setDiscountPercent(Number(event.target.value))}
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={saveDiscount}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-brand/20 bg-brand/10 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Simpan Discount
                  </button>
                </div>
              </NeonCard>

              <NeonCard>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Premku API Key</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="password"
                    value={premkuKey}
                    onChange={(event) => setPremkuKey(event.target.value)}
                    placeholder="Masukkan API key baru"
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={savePremkuKey}
                    disabled={saving || !premkuKey.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 disabled:opacity-60"
                  >
                    Simpan Key
                  </button>
                </div>
              </NeonCard>
            </div>
          </div>
        </PageSection>

        <PageSection title="Preview harga" subtitle="Simulasi harga jual otomatis">
          <div className="space-y-3">
            {previews.map((item) => (
              <NeonCard key={item.price}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Harga dasar</p>
                    <p className="mt-1 text-lg font-black text-white">{formatCurrency(item.price)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Markup Reseller</p>
                    <p className="mt-1 text-lg font-black text-sky-300">{item.resellerPercent}%</p>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/45">Tipe aktif</span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
                      <Percent className="h-4 w-4" />
                      {markupType}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm text-white/55">Harga reseller</span>
                    <span className="text-lg font-black text-white">{formatCurrency(item.resellerFinalPrice)}</span>
                  </div>
                </div>
              </NeonCard>
            ))}
            {!loading && !previews.length ? <p className="text-sm text-white/45">Belum ada produk aktif untuk preview markup.</p> : null}
          </div>

          <NeonCard className="mt-4">
            <div className="flex items-center gap-3">
              <Calculator className="h-5 w-5 text-brand" />
              <div>
                <p className="text-sm font-semibold text-white">Satu sumber data</p>
                <p className="mt-1 text-sm leading-6 text-white/55">
                  Backend dan frontend membaca markup dari setting yang sama. Harga produk dan order otomatis ikut sinkron.
                </p>
              </div>
            </div>
          </NeonCard>
        </PageSection>
      </div>
    </div>
  );
}
