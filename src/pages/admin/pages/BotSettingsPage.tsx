import { useEffect, useState } from 'react';
import { Bot, LogOut, QrCode, RefreshCw, Save, ToggleLeft, ToggleRight, Wifi } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type BotSettingsRecord } from '../../../services/api';

const fallback: BotSettingsRecord = {
  enabled: false,
  auto_reply_enabled: false,
  panel_name: 'Premiumin Plus',
  greeting_message: 'Halo, selamat datang di Premiumin Plus.',
  footer_message: 'Premiumin Plus',
  keyword_response: 'Untuk melihat stok ketik stok / list.',
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
  const [botStatus, setBotStatus] = useState<Awaited<ReturnType<typeof premiuminApi.botSessionStatus>>['data'] | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
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

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      try {
        const response = await premiuminApi.botSessionStatus(apiKey || undefined);
        if (active) setBotStatus(response.data);
      } catch {
        if (active) setBotStatus(null);
      }
    };
    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
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

  const connectBot = async () => {
    setSessionLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await premiuminApi.botSessionConnect(apiKey || undefined);
      setBotStatus(response.data);
      setSuccess(response.data.qr ? 'QR admin bot dibuat. Scan untuk mengaktifkan monitoring.' : 'Admin bot aktif.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal connect admin bot.');
    } finally {
      setSessionLoading(false);
    }
  };

  const logoutBot = async () => {
    setSessionLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await premiuminApi.botSessionLogout(apiKey || undefined);
      setBotStatus(response.data);
      setSuccess('Session admin bot dihapus.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal logout admin bot.');
    } finally {
      setSessionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHero
        title="Bot Settings"
        subtitle="Default response untuk bot reseller dan monitoring ekosistem WhatsApp."
        slogan="Session QR tetap milik reseller masing-masing. Admin mengatur template global dan feature flag."
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
              value={settings.panel_name || ''}
              onChange={(event) => setSettings((current) => ({ ...current, panel_name: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Panel name"
            />
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
            <input
              value={settings.keyword_response || ''}
              onChange={(event) => setSettings((current) => ({ ...current, keyword_response: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Keyword response"
            />
            <input
              value={settings.footer_message || ''}
              onChange={(event) => setSettings((current) => ({ ...current, footer_message: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Footer message"
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

        <PageSection title="Admin Notification Bot" subtitle="QR login dan status monitoring">
          <div className="space-y-3">
            <NeonCard>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-white">{botStatus?.connected ? 'BOT ACTIVE' : 'BOT BELUM CONNECT'}</p>
                  <p className="mt-1 text-xs text-white/45">Session: {botStatus?.status || 'idle'}</p>
                  {botStatus?.connected_number ? <p className="mt-2 text-xs font-bold text-emerald-300">{botStatus.connected_number}</p> : null}
                  {botStatus?.last_active ? <p className="mt-1 text-xs text-white/35">Last active: {botStatus.last_active}</p> : null}
                  <p className="mt-2 text-xs text-brand-light">LID: 64957102211197@lid</p>
                </div>
                <Wifi className={`h-5 w-5 ${botStatus?.connected ? 'text-emerald-300' : 'text-white/30'}`} />
              </div>
            </NeonCard>
            {botStatus?.qr ? (
              <div className="rounded-2xl border border-white/10 bg-white p-3">
                <img src={botStatus.qr} alt="QR Admin Bot" className="aspect-square w-full rounded-xl object-contain" />
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <button onClick={connectBot} disabled={sessionLoading} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 disabled:opacity-60">
                {botStatus?.qr ? <RefreshCw className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
                {sessionLoading ? 'Memproses...' : botStatus?.connected ? 'Reconnect' : 'Connect'}
              </button>
              <button onClick={logoutBot} disabled={sessionLoading} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200 disabled:opacity-60">
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
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
                    <span className="mt-1 block text-xs text-white/45">Disimpan sebagai default handler WhatsApp.</span>
                  </span>
                  {settings.features[key as keyof BotSettingsRecord['features']] ? <ToggleRight className="h-7 w-7 text-brand" /> : <ToggleLeft className="h-7 w-7 text-white/35" />}
                </button>
              </NeonCard>
            ))}
            <NeonCard>
              <Bot className="h-5 w-5 text-brand" />
              <p className="mt-3 text-sm leading-6 text-white/55">
                Worker WhatsApp berjalan sebagai service terpisah. Admin bot khusus notifikasi memakai LID monitoring yang dikonfigurasi di environment.
              </p>
            </NeonCard>
          </div>
        </PageSection>
      </div>
    </div>
  );
}
