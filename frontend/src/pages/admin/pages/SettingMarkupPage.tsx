import { useEffect, useMemo, useState } from 'react';
import { Calculator, Percent, Save } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { formatCurrency } from '../../../utils/format';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type MarkupSettingRecord, type ProductRecord } from '../../../services/api';

export function SettingMarkupPage() {
  const [memberMarkup, setMemberMarkup] = useState(0);
  const [resellerMarkup, setResellerMarkup] = useState(0);
  const [markupType, setMarkupType] = useState<MarkupSettingRecord['markup_type']>('percent');
  const [discountPercent, setDiscountPercent] = useState(10);
  const [premkuKey, setPremkuKey] = useState('');
  const [premkuKeyMasked, setPremkuKeyMasked] = useState('');
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const apiKey = getApiKey();

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

        setMemberMarkup(markupResponse.data.member_markup ?? markupResponse.data.markup);
        setResellerMarkup(markupResponse.data.reseller_markup ?? 0);
        setMarkupType(markupResponse.data.markup_type);
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
    return products.slice(0, 5).map((item) => {
      const price = item.price_base;
      const memberFinalPrice =
        markupType === 'fixed' ? price + memberMarkup : price + Math.round((price * memberMarkup) / 100);
      const resellerFinalPrice =
        markupType === 'fixed' ? price + resellerMarkup : price + Math.round((price * resellerMarkup) / 100);
      return {
        price,
        finalPrice: memberFinalPrice,
        resellerFinalPrice,
        delta: memberFinalPrice - price,
        resellerDelta: resellerFinalPrice - price,
      };
    });
  }, [memberMarkup, resellerMarkup, markupType, products]);

  const saveMarkup = async () => {
    setSaving(true);
    setError('');

    try {
      const response = await premiuminApi.updateMarkup({ markup: memberMarkup, member_markup: memberMarkup, reseller_markup: resellerMarkup, markup_type: markupType }, apiKey || undefined);
      setMemberMarkup(response.data.member_markup ?? response.data.markup);
      setResellerMarkup(response.data.reseller_markup ?? 0);
      setMarkupType(response.data.markup_type);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan markup.');
    } finally {
      setSaving(false);
    }
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
      <PageHero
        title="Setting Markup"
        subtitle="Markup anggota dan reseller dipisah sesuai flow bisnis Premiumin Plus."
        slogan="Member memakai harga anggota. Reseller memakai harga reseller dan tetap wajib saldo."
        tone="from-amber-500/15 via-brand/10 to-sky-500/10"
        chips={['Markup anggota', 'Markup reseller', 'DB sync']}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Mode</p>
          <p className="mt-2 text-2xl font-black text-white">{markupType}</p>
          <p className="mt-2 text-sm text-white/45">fixed atau percent.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Markup Anggota</p>
          <p className="mt-2 text-2xl font-black text-white">{memberMarkup}</p>
          <p className="mt-2 text-sm text-white/45">Harga pembeli member.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Discount Label</p>
          <p className="mt-2 text-2xl font-black text-white">{discountPercent}%</p>
          <p className="mt-2 text-sm text-white/45">Tampil di kartu daftar harga.</p>
        </NeonCard>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <PageSection title="Atur markup role" subtitle="Harga member dan reseller dipisah">
          <div className="space-y-3">
            <div className="rounded-[1.15rem] border border-white/10 bg-[#0f0b15] p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_160px]">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Markup Anggota</span>
                  <input
                    type="number"
                    value={memberMarkup}
                    onChange={(event) => setMemberMarkup(Number(event.target.value))}
                    className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Markup Reseller</span>
                  <input
                    type="number"
                    value={resellerMarkup}
                    onChange={(event) => setResellerMarkup(Number(event.target.value))}
                    className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Tipe</span>
                  <select
                    value={markupType}
                    onChange={(event) => setMarkupType(event.target.value as MarkupSettingRecord['markup_type'])}
                    className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none"
                  >
                    <option value="percent">percent</option>
                    <option value="fixed">fixed</option>
                  </select>
                </label>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-white/45">
                  {markupType === 'fixed'
                    ? 'Harga jual = base + markup role'
                    : 'Harga jual = base + (base x markup role / 100)'}
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
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Markup Anggota</p>
                    <p className="mt-1 text-lg font-black text-emerald-300">{formatCurrency(item.delta)}</p>
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
                    <span className="text-sm text-white/55">Harga anggota</span>
                    <span className="text-lg font-black text-white">{formatCurrency(item.finalPrice)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
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

