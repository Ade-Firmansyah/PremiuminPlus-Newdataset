import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, Eye, Link2, Loader2, Palette, Power, Save, Unlink, X } from 'lucide-react';
import { PageSection } from './dashboardPageKit';
import { getApiKey } from '../store/useAuth';
import { premiuminApi, type BotSettingsRecord } from '../services/api';
import { startAdaptivePolling } from '../services/adaptivePolling';
import { subscribeSocket } from '../services/socketManager';

function resolveBotEngineUrl() {
  const configured = String(import.meta.env.VITE_BOT_ENGINE_URL || '').trim();
  if (configured) {
    try {
      const url = new URL(configured);
      const browserHost = typeof window !== 'undefined' ? window.location.hostname : '';
      const configuredIsLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
      const browserIsLocal = ['localhost', '127.0.0.1', '::1', ''].includes(browserHost);
      if (configuredIsLocal && !browserIsLocal) {
        url.hostname = browserHost;
        url.protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        return url.toString().replace(/\/+$/, '');
      }
    } catch {
      return configured.replace(/\/+$/, '');
    }
    return configured.replace(/\/+$/, '');
  }

  if (typeof window === 'undefined') return 'http://localhost:4010';
  if (window.location.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
    return '';
  }
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const hostname = window.location.hostname || 'localhost';
  return `${protocol}//${hostname}:4010`;
}

const botEngineUrl = resolveBotEngineUrl();
type BotLoginState = 'idle' | 'connecting' | 'waiting_qr' | 'connected' | 'expired' | 'failed';
type BotTheme = NonNullable<BotSettingsRecord['active_theme']>;

const botThemeOptions: Array<{ value: BotTheme; label: string; description: string }> = [
  { value: 'theme_1', label: 'Theme 1 Default', description: 'Classic Premiumin box style.' },
  { value: 'theme_2', label: 'Theme 2 Bold Box', description: 'Tampilan tebal dengan live stock list.' },
  { value: 'theme_3', label: 'Theme 3 Minimal', description: 'Format pendek, bersih, dan cepat dibaca.' },
  { value: 'theme_4', label: 'Theme 4 Luxury', description: 'Style premium dengan diamond separator.' },
  { value: 'theme_5', label: 'Theme 5 Console', description: 'Style compact seperti terminal.' },
];

const fallback: BotSettingsRecord = {
  enabled: false,
  allow_group_reply: false,
  allowed_group_lids: [],
  auto_reply_enabled: false,
  greeting_message: '',
  auto_reply_prompt: '',
  order_format: '',
  margin_setting: 0,
  greeting_template: '',
  store_name: 'Premiumin Pluus',
  admin_whatsapp: '',
  open_hour: '08.00 - 22.00 WIB',
  active_theme: 'theme_1',
  opening_hour: '08.00',
  closing_hour: '22.00',
  footer_text: 'Premiumin Pluus',
  bot_session_status: 'disconnected',
  features: {
    order_status: false,
    balance_check: false,
    product_catalog: false,
  },
};

function statusCopy(status?: string) {
  if (status === 'connected') return 'Bot Aktif';
  if (status === 'connecting' || status === 'qr') return 'Menunggu Scan';
  if (status === 'logged_out') return 'Device Logout';
  if (status === 'error') return 'Butuh Reconnect';
  return 'Belum Terhubung';
}

function realtimeUrlForSession(sessionId?: number) {
  if (!sessionId || !botEngineUrl) return '';
  try {
    const url = new URL(botEngineUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/realtime';
    url.searchParams.set('sessionId', String(sessionId));
    return url.toString();
  } catch {
    return '';
  }
}

function isBotPending(status?: string) {
  return status === 'connecting' || status === 'qr';
}

function mergeBotSettings(data: BotSettingsRecord): BotSettingsRecord {
  const template = data.bot_template || ({} as NonNullable<BotSettingsRecord['bot_template']>);
  return {
    ...fallback,
    ...data,
    active_theme: data.active_theme || template.active_theme || fallback.active_theme,
    store_name: data.store_name || template.store_name || fallback.store_name,
    opening_hour: data.opening_hour || template.opening_hour || fallback.opening_hour,
    closing_hour: data.closing_hour || template.closing_hour || fallback.closing_hour,
    admin_whatsapp: data.admin_whatsapp || template.admin_whatsapp || fallback.admin_whatsapp,
    footer_text: data.footer_text || template.footer_text || fallback.footer_text,
  };
}

export default function BotWA() {
  const [settings, setSettings] = useState<BotSettingsRecord>(fallback);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qrImage, setQrImage] = useState('');
  const [loginState, setLoginState] = useState<BotLoginState>('idle');
  const [lastConnectedAt, setLastConnectedAt] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [themePreview, setThemePreview] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const loginStateRef = useRef<BotLoginState>('idle');
  const apiKey = getApiKey();
  const requiredLock = Number(settings.lock_required || 0);
  const realtimeUrl = useMemo(() => realtimeUrlForSession(settings.user_id), [settings.user_id]);
  const connected = settings.bot_session_status === 'connected';

  useEffect(() => {
    loginStateRef.current = loginState;
  }, [loginState]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const settingsResponse = await premiuminApi.myBotSettings(apiKey || undefined);
      setSettings(mergeBotSettings(settingsResponse.data));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat setting bot.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [apiKey]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const response = await premiuminApi.botTemplatePreview(
          {
            active_theme: settings.active_theme || 'theme_1',
            store_name: settings.store_name || 'Premiumin Pluus',
            opening_hour: settings.opening_hour || '08.00',
            closing_hour: settings.closing_hour || '22.00',
            admin_whatsapp: settings.admin_whatsapp || '',
            footer_text: settings.footer_text || 'Premiumin Pluus',
          },
          apiKey || undefined,
        );
        setThemePreview(response.data.preview);
      } catch (caught) {
        const statusCode = (caught as Error & { statusCode?: number })?.statusCode;
        if (statusCode === 404) {
          setThemePreview('Preview theme belum bisa dimuat karena backend belum memuat endpoint terbaru. Restart backend atau jalankan npm run all.');
        } else {
          setThemePreview(caught instanceof Error ? `Preview theme gagal dimuat: ${caught.message}` : 'Preview theme belum bisa dimuat. Pastikan backend aktif.');
        }
      } finally {
        setPreviewLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [apiKey, settings.active_theme, settings.admin_whatsapp, settings.closing_hour, settings.footer_text, settings.opening_hour, settings.store_name]);

  useEffect(() => {
    if (!realtimeUrl) return undefined;

    let closeTimer = 0;
    const unsubscribe = subscribeSocket(realtimeUrl, (payload) => {
      if (payload.type === 'snapshot') {
        const status = String(payload.status || 'disconnected') as BotSettingsRecord['bot_session_status'];
        const snapshotQr = typeof payload.qr_image === 'string' ? payload.qr_image : '';
        setSettings((current) => (current.bot_session_status === status ? current : { ...current, bot_session_status: status }));
        setQrImage((current) => (current === snapshotQr ? current : snapshotQr));
        if (status === 'connected') {
          if (loginStateRef.current === 'connecting' || loginStateRef.current === 'waiting_qr') {
            setLastConnectedAt(new Date().toLocaleString('id-ID'));
            setLoginState('connected');
            closeTimer = window.setTimeout(() => setLoginState('idle'), 1300);
          }
        } else if (snapshotQr || status === 'qr') {
          setLoginState('waiting_qr');
        }
        return;
      }

      if (payload.type === 'qr') {
        const nextQr = typeof payload.qr_image === 'string' ? payload.qr_image : '';
        setQrImage((current) => (current === nextQr ? current : nextQr));
        if (loginStateRef.current !== 'waiting_qr') setLoginState('waiting_qr');
        setSettings((current) => (current.bot_session_status === 'qr' ? current : { ...current, bot_session_status: 'qr' }));
        return;
      }

      if (payload.type === 'status') {
        const status = String(payload.status || 'disconnected') as BotSettingsRecord['bot_session_status'];
        setSettings((current) => (current.bot_session_status === status ? current : { ...current, bot_session_status: status }));

        if (status === 'connected') {
          setQrImage((current) => (current ? '' : current));
          if (loginStateRef.current === 'connecting' || loginStateRef.current === 'waiting_qr') {
            setLastConnectedAt(new Date().toLocaleString('id-ID'));
            setLoginState('connected');
            closeTimer = window.setTimeout(() => setLoginState('idle'), 1300);
          }
        } else if (status === 'logged_out') {
          setQrImage('');
          setLoginState('expired');
        } else if (status === 'error') {
          setQrImage('');
          setLoginState('failed');
        }
      }
    });

    return () => {
      window.clearTimeout(closeTimer);
      unsubscribe();
    };
  }, [realtimeUrl]);

  useEffect(() => {
    if (!apiKey || (!isBotPending(settings.bot_session_status) && !['connecting', 'waiting_qr'].includes(loginState))) return undefined;

    return startAdaptivePolling({
      activeMs: 5000,
      idleMs: 15000,
      idleAfterMs: 45000,
      task: async () => {
        const response = await premiuminApi.botSessionStatus(apiKey || undefined);
        setSettings((current) => ({ ...current, ...response.data }));

        if (response.data.user_id && isBotPending(response.data.bot_session_status)) {
          const nextQr = typeof response.data.qr_image === 'string' ? response.data.qr_image : '';
          if (nextQr) {
            setQrImage(nextQr);
            setLoginState('waiting_qr');
          }
        }

        if (response.data.bot_session_status === 'connected') {
          setQrImage('');
          setLastConnectedAt(new Date().toLocaleString('id-ID'));
          if (loginStateRef.current === 'connecting' || loginStateRef.current === 'waiting_qr') {
            setLoginState('connected');
            window.setTimeout(() => setLoginState('idle'), 1300);
          }
        }

        return response.data;
      },
      shouldContinue: (data) => isBotPending(data?.bot_session_status) || ['connecting', 'waiting_qr'].includes(loginState),
    });
  }, [apiKey, loginState, settings.bot_session_status]);

  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await premiuminApi.updateMyBotSettings(settings, apiKey || undefined);
      setSettings(mergeBotSettings(response.data));
      setMessage('Setting bot tersimpan.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan setting bot.');
    } finally {
      setSaving(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    setQrImage('');
    setLoginState('connecting');
    try {
      const response = await premiuminApi.botSessionConnect(apiKey || undefined);
      setSettings((current) => ({ ...current, ...response.data, enabled: true }));
      if (response.data.qr_image) {
        setQrImage(response.data.qr_image);
        setLoginState('waiting_qr');
      }
      setMessage('Session dibuat. QR akan tampil realtime saat bot-engine mengirim pairing code.');
    } catch (caught) {
      setLoginState('failed');
      setError(
        caught instanceof TypeError
          ? `Bot-engine tidak bisa diakses di ${botEngineUrl}. Pastikan npm run bot aktif dan buka web memakai host yang sama dengan server, bukan localhost dari HP.`
          : caught instanceof Error
            ? caught.message
            : 'Gagal connect device.',
      );
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await premiuminApi.botSessionLogout(apiKey || undefined);
      setSettings((current) => ({ ...current, ...response.data }));
      setQrImage('');
      setLoginState('idle');
      setMessage('Device diputus.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal disconnect device.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageSection title="Buat Bot WhatsApp" subtitle="Session WhatsApp pribadi">
        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-2xl border border-white/10 bg-[#0b0f1a] p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/25">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Status Bot</p>
                <h3 className="mt-1 text-xl font-black text-white">{statusCopy(settings.bot_session_status)}</h3>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/65">
              Minimal saldo bot: <b className="text-white">{requiredLock > 0 ? `Rp${requiredLock.toLocaleString('id-ID')}` : '-'}</b>
            </div>

            {connected ? (
              <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm leading-6 text-emerald-100">
                Bot Connected. {lastConnectedAt ? `Last connected: ${lastConnectedAt}` : 'Device active.'}
              </div>
            ) : null}

            {settings.bot_locked ? (
              <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
                Saldo bot tidak mencukupi. Minimal saldo untuk bot adalah {requiredLock > 0 ? `Rp${requiredLock.toLocaleString('id-ID')}` : 'sesuai role akun'}.
              </div>
            ) : null}

            {qrImage ? (
              <div className="mt-4 rounded-2xl border border-brand/25 bg-white p-3">
                <img src={qrImage} alt="QR WhatsApp Bot" className="mx-auto aspect-square max-h-64 w-full object-contain" />
              </div>
            ) : null}

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={connect}
                disabled={busy || settings.bot_locked || connected}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black text-white shadow-lg disabled:opacity-50 ${
                  connected ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-brand shadow-brand/20'
                }`}
              >
                {connected ? <CheckCircle2 className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                {connected ? 'Bot Connected' : 'Connect Device'}
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white/75 disabled:opacity-50"
              >
                <Unlink className="h-4 w-4" />
                Disconnect Device
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {loading ? <p className="text-sm text-white/45">Memuat setting bot...</p> : null}
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3">
              <span className="text-sm font-bold text-white">Bot Aktif</span>
              <button type="button" onClick={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))} className="text-brand">
                <Power className={`h-5 w-5 ${settings.enabled ? 'fill-current' : ''}`} />
              </button>
            </label>
            <label className="block rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3">
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/45">
                <Palette className="h-4 w-4 text-brand" />
                Bot Theme Settings
              </span>
              <select
                value={settings.active_theme || 'theme_1'}
                onChange={(event) => setSettings((current) => ({ ...current, active_theme: event.target.value as BotTheme }))}
                className="mt-3 w-full rounded-xl border border-white/10 bg-[#111827] px-3 py-3 text-sm font-bold text-white outline-none"
              >
                {botThemeOptions.map((theme) => (
                  <option key={theme.value} value={theme.value}>
                    {theme.label}
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-xs text-white/40">
                {botThemeOptions.find((theme) => theme.value === (settings.active_theme || 'theme_1'))?.description}
              </span>
            </label>
            <label className="block rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Nama Toko</span>
              <input
                value={settings.store_name || ''}
                onChange={(event) => setSettings((current) => ({ ...current, store_name: event.target.value }))}
                className="mt-2 w-full bg-transparent text-sm font-bold text-white outline-none"
                placeholder="Store Name"
              />
            </label>
            <label className="block rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Markup Bot Per Produk</span>
              <input
                value={String(settings.margin_setting || 0)}
                onChange={(event) => setSettings((current) => ({ ...current, margin_setting: Number(event.target.value.replace(/\D/g, '')) || 0 }))}
                className="mt-2 w-full bg-transparent text-sm font-bold text-white outline-none"
                inputMode="numeric"
                placeholder="0"
              />
              <span className="mt-1 block text-xs text-white/40">Harga katalog bot = harga produk + markup ini.</span>
            </label>
            <label className="block rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Admin WhatsApp</span>
              <input
                value={settings.admin_whatsapp || ''}
                onChange={(event) => setSettings((current) => ({ ...current, admin_whatsapp: event.target.value.replace(/\D/g, '') }))}
                className="mt-2 w-full bg-transparent text-sm font-bold text-white outline-none"
                inputMode="tel"
                placeholder="628xxxxxxxxxx"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Jam Buka</span>
                <input
                  value={settings.opening_hour || ''}
                  onChange={(event) => setSettings((current) => ({ ...current, opening_hour: event.target.value }))}
                  className="mt-2 w-full bg-transparent text-sm font-bold text-white outline-none"
                  placeholder="08.00"
                />
              </label>
              <label className="block rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Jam Tutup</span>
                <input
                  value={settings.closing_hour || ''}
                  onChange={(event) => setSettings((current) => ({ ...current, closing_hour: event.target.value }))}
                  className="mt-2 w-full bg-transparent text-sm font-bold text-white outline-none"
                  placeholder="22.00"
                />
              </label>
            </div>
            <label className="block rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Footer Text</span>
              <input
                value={settings.footer_text || ''}
                onChange={(event) => setSettings((current) => ({ ...current, footer_text: event.target.value }))}
                className="mt-2 w-full bg-transparent text-sm font-bold text-white outline-none"
                placeholder="Premiumin Pluus"
              />
            </label>
            <div className="rounded-2xl border border-white/10 bg-[#0b0f1a] p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-white/45">
                  <Eye className="h-4 w-4 text-brand" />
                  Preview Theme
                </span>
                {previewLoading ? <Loader2 className="h-4 w-4 animate-spin text-white/45" /> : null}
              </div>
              <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/35 p-3 font-mono text-[11px] leading-5 text-white/80">
                {themePreview || 'Preview sedang dimuat...'}
              </pre>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3">
              <span>
                <span className="block text-sm font-bold text-white">Balas Grup Terdaftar</span>
                <span className="mt-1 block text-xs text-white/40">Off = bot hanya membalas chat pribadi.</span>
              </span>
              <button
                type="button"
                onClick={() => setSettings((current) => ({ ...current, allow_group_reply: !current.allow_group_reply }))}
                className={`h-7 w-12 rounded-full border p-1 transition ${
                  settings.allow_group_reply ? 'border-emerald-400/40 bg-emerald-500/25' : 'border-white/10 bg-white/5'
                }`}
                aria-label="Toggle balas grup terdaftar"
              >
                <span className={`block h-5 w-5 rounded-full bg-white transition ${settings.allow_group_reply ? 'translate-x-5' : ''}`} />
              </button>
            </label>
            <label className="block rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Allowed Group LID / JID</span>
              <textarea
                value={(settings.allowed_group_lids || []).join('\n')}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    allowed_group_lids: event.target.value
                      .split(/[\n,]+/)
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }))
                }
                className="mt-2 min-h-24 w-full bg-transparent text-sm leading-6 text-white outline-none"
                placeholder="120363xxxxxxxx@g.us"
              />
              <span className="mt-1 block text-xs text-white/40">Satu grup per baris. Grup lain akan diabaikan total oleh bot.</span>
            </label>
            {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
            {message ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
            <button onClick={save} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 disabled:opacity-60">
              <Save className="h-4 w-4" />
              {saving ? 'Menyimpan...' : 'Simpan Setting'}
            </button>
          </div>
        </div>
      </PageSection>

      {loginState !== 'idle' ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-[1.45rem] border border-brand/25 bg-[#0f172a] shadow-[0_0_44px_rgba(255,46,136,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-[linear-gradient(135deg,rgba(255,46,136,0.16),rgba(15,23,42,0.96))] px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brand-light">WhatsApp Login</p>
                <h3 className="mt-1 text-lg font-black text-white">{statusCopy(settings.bot_session_status)}</h3>
              </div>
              <button type="button" onClick={() => setLoginState('idle')} className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/60">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {loginState === 'connected' ? (
                <div className="grid place-items-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-8 text-center text-emerald-100">
                  <CheckCircle2 className="h-12 w-12 text-emerald-300" />
                  <p className="mt-3 text-sm font-black">Bot Terhubung</p>
                </div>
              ) : qrImage ? (
                <div className="mx-auto grid aspect-square max-w-[260px] place-items-center rounded-[1.25rem] border border-brand/25 bg-white p-4 shadow-[0_0_30px_rgba(255,46,136,0.18)]">
                  <img src={qrImage} alt="QR WhatsApp Bot" className="h-full w-full object-contain" />
                </div>
              ) : (
                <div className="grid place-items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-8 text-center text-white/65">
                  <Loader2 className="h-9 w-9 animate-spin text-brand-light" />
                  <p className="mt-3 text-sm font-bold">{loginState === 'failed' ? (error || 'Gagal membuat session.') : 'Menunggu QR realtime...'}</p>
                </div>
              )}

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/65">
                {loginState === 'waiting_qr'
                  ? 'Scan QR ini dari WhatsApp > Linked devices.'
                  : loginState === 'connected'
                    ? 'Session tersimpan dan status dashboard akan sinkron.'
                    : loginState === 'failed'
                      ? `Pastikan backend core dan bot-engine aktif. Target bot-engine: ${botEngineUrl}`
                      : 'Bot-engine sedang menyiapkan session terisolasi.'}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

