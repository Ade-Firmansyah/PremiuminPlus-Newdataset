import { useEffect, useState } from 'react';
import { Bot, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type BotSettingsRecord } from '../../../services/api';

const fallback: BotSettingsRecord = {
  enabled: false,
  auto_reply_enabled: false,
  greeting_message: 'Halo, selamat datang di Premiumin Pluus.',
  auto_reply_prompt: 'Balas pelanggan dengan ramah, singkat, dan arahkan ke format order resmi.',
  order_format: 'ORDER#KODE_PRODUK#QTY#NOMOR_WA',
  features: {
    order_status: false,
    balance_check: false,
    product_catalog: false,
  },
};

export function BotSettingsPage() {
  const [settings, setSettings] = useState<BotSettingsRecord>(fallback);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const apiKey = getApiKey();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await premiuminApi.botSettings(apiKey || undefined);
        setSettings(response.data);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Gagal memuat setting bot.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [apiKey]);

  const toggle = (key: keyof BotSettingsRecord['features']) => {
    setSettings((current) => ({
      ...current,
      features: {
        ...current.features,
        [key]: !current.features[key],
      },
    }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await premiuminApi.updateBotSettings(settings, apiKey || undefined);
      setSettings(response.data);
      setSuccess('Bot settings tersimpan. Integrasi WA bisa memakai endpoint ini nanti.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan setting bot.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHero
        title="Bot Settings"
        subtitle="Arsitektur disiapkan untuk integrasi WhatsApp bot berikutnya."
        slogan="Belum menjalankan bot. Halaman ini hanya menyimpan prompt, greeting, format order, dan feature flag."
        tone="from-emerald-500/15 via-cyan-500/10 to-brand/10"
        chips={['Prompt', 'Greeting', 'Feature flags']}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <PageSection title="Konfigurasi bot" subtitle="Future-ready settings">
          <div className="space-y-3">
            {loading ? <p className="text-sm text-white/45">Memuat setting bot...</p> : null}
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3">
              <span className="text-sm font-bold text-white">Enable bot module</span>
              <button type="button" onClick={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))} className="text-brand">
                {settings.enabled ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
              </button>
            </label>
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3">
              <span className="text-sm font-bold text-white">Auto reply</span>
              <button type="button" onClick={() => setSettings((current) => ({ ...current, auto_reply_enabled: !current.auto_reply_enabled }))} className="text-brand">
                {settings.auto_reply_enabled ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
              </button>
            </label>
            <input
              value={settings.greeting_message}
              onChange={(event) => setSettings((current) => ({ ...current, greeting_message: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Greeting message"
            />
            <input
              value={settings.order_format}
              onChange={(event) => setSettings((current) => ({ ...current, order_format: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Format order"
            />
            <textarea
              value={settings.auto_reply_prompt}
              onChange={(event) => setSettings((current) => ({ ...current, auto_reply_prompt: event.target.value }))}
              className="min-h-40 w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-brand/50"
              placeholder="Auto reply prompt"
            />
            {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
            {success ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}
            <button onClick={save} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 disabled:opacity-60">
              <Save className="h-4 w-4" />
              {saving ? 'Menyimpan...' : 'Simpan Bot Settings'}
            </button>
          </div>
        </PageSection>

        <PageSection title="Feature flags" subtitle="Belum menjalankan bot">
          <div className="space-y-3">
            {[
              ['order_status', 'Cek status order'],
              ['balance_check', 'Cek saldo'],
              ['product_catalog', 'Katalog produk'],
            ].map(([key, label]) => (
              <NeonCard key={key}>
                <button
                  type="button"
                  onClick={() => toggle(key as keyof BotSettingsRecord['features'])}
                  className="flex w-full items-center justify-between gap-4 text-left"
                >
                  <span>
                    <span className="block text-sm font-black text-white">{label}</span>
                    <span className="mt-1 block text-xs text-white/45">Disimpan sebagai setting untuk integrasi WA nanti.</span>
                  </span>
                  {settings.features[key as keyof BotSettingsRecord['features']] ? <ToggleRight className="h-7 w-7 text-brand" /> : <ToggleLeft className="h-7 w-7 text-white/35" />}
                </button>
              </NeonCard>
            ))}
            <NeonCard>
              <Bot className="h-5 w-5 text-brand" />
              <p className="mt-3 text-sm leading-6 text-white/55">
                Endpoint bot sudah siap, tapi worker WhatsApp belum diaktifkan agar sistem tetap ringan.
              </p>
            </NeonCard>
          </div>
        </PageSection>
      </div>
    </div>
  );
}

