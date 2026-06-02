import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, KeyRound, LogOut, QrCode, RefreshCw, Save, Store, ToggleRight, Wifi } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from './dashboardPageKit';
import { getApiKey } from '../store/useAuth';
import { premiuminApi, type BotSettingsRecord, type DepositRecord, type MeRecord } from '../services/api';
import { useStablePolling } from '../hooks/useStablePolling';
import { formatCurrency } from '../utils/format';

const fallback: BotSettingsRecord = {
  enabled: false,
  auto_reply_enabled: false,
  panel_name: 'Premiumin Plus',
  greeting_message: 'Halo kak, selamat datang di Premiumin Plus.',
  footer_message: 'Premiumin Plus',
  keyword_response: 'Untuk melihat stok ketik stok / list.',
  auto_reply_prompt: 'Jawab pelanggan dengan ramah, validasi format order, lalu arahkan pembayaran melalui dashboard.',
  order_format: 'ORDER#KODE_PRODUK#QTY#NOMOR_WA',
  features: {
    order_status: false,
    balance_check: false,
    product_catalog: false,
  },
};

function isPendingDepositStatus(status?: string | null) {
  return ['pending', 'pending_payment'].includes(String(status || '').toLowerCase());
}

export default function BotWA() {
  const [settings, setSettings] = useState<BotSettingsRecord>(fallback);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [botStatus, setBotStatus] = useState<Awaited<ReturnType<typeof premiuminApi.botSessionStatus>>['data'] | null>(null);
  const [me, setMe] = useState<MeRecord | null>(null);
  const [activationDeposit, setActivationDeposit] = useState<DepositRecord | null>(null);
  const [activationLoading, setActivationLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState('');
  const [marginDraft, setMarginDraft] = useState(0);
  const [persistedMargin, setPersistedMargin] = useState(0);
  const [marginSaving, setMarginSaving] = useState(false);
  const marginSaveTimer = useRef<number | null>(null);
  const marginSaveSeq = useRef(0);
  const marginDesired = useRef(0);
  const apiKey = getApiKey();

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [response, meResponse] = await Promise.all([
          premiuminApi.myBotSettings(apiKey || undefined),
          premiuminApi.me(apiKey || undefined),
        ]);
        if (!active) return;
        const resolvedMargin = Number(meResponse.data.reseller_margin_percent ?? meResponse.data.markup_percent ?? 0);
        setMe(meResponse.data);
        setSettings(response.data);
        setMarginDraft(resolvedMargin);
        marginDesired.current = resolvedMargin;
        setPersistedMargin(resolvedMargin);
        setApiKeyMasked(meResponse.data.api_key ? `${meResponse.data.api_key.slice(0, 10)}...${meResponse.data.api_key.slice(-6)}` : '-');
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Gagal memuat setting bot.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
      if (marginSaveTimer.current) window.clearTimeout(marginSaveTimer.current);
    };
  }, [apiKey]);

  const persistMargin = async (value = marginDraft, silent = false) => {
    const normalized = Math.max(0, Math.min(100, Math.round(Number(value || 0))));
    const requestSeq = marginSaveSeq.current + 1;
    marginSaveSeq.current = requestSeq;
    setMarginSaving(true);
    if (!silent) {
      setError('');
      setSuccess('');
    }
    try {
      const response = await premiuminApi.updateMyPreferences({ reseller_margin_percent: normalized, markup_percent: normalized }, apiKey || undefined);
      const saved = Number(response.data.reseller_margin_percent ?? response.data.markup_percent ?? normalized);
      if (requestSeq !== marginSaveSeq.current) return;
      setPersistedMargin(saved);
      if (marginDesired.current === normalized) {
        setMarginDraft(saved);
        marginDesired.current = saved;
      }
      if (!silent) setSuccess('Margin bot tersimpan.');
    } catch (caught) {
      if (requestSeq === marginSaveSeq.current) {
        setError(caught instanceof Error ? caught.message : 'Gagal menyimpan margin bot.');
      }
    } finally {
      if (requestSeq === marginSaveSeq.current) setMarginSaving(false);
    }
  };

  useEffect(() => {
    if (loading || marginDraft === persistedMargin) return;
    if (marginSaveTimer.current) window.clearTimeout(marginSaveTimer.current);
    marginSaveTimer.current = window.setTimeout(() => {
      void persistMargin(marginDraft, true);
    }, 700);
    return () => {
      if (marginSaveTimer.current) window.clearTimeout(marginSaveTimer.current);
    };
  }, [loading, marginDraft, persistedMargin]);

  const botUnlocked = Boolean(me?.bot_access_unlocked && Number(me?.locked_balance || 0) >= 50000 && Number(me?.saldo || 0) >= Number(me?.locked_balance || 0));

  const loadStatus = useCallback(async () => {
    if (!botUnlocked) return;
    try {
      const response = await premiuminApi.botSessionStatus(apiKey || undefined);
      setBotStatus(response.data);
    } catch {
      setBotStatus(null);
    }
  }, [apiKey, botUnlocked]);

  useStablePolling(loadStatus, () => (botStatus?.qr ? 10000 : 30000), {
    enabled: botUnlocked,
    immediate: true,
    pauseWhenHidden: true,
    focusThrottleMs: 15000,
  });

  useStablePolling(
    async () => {
      if (!activationDeposit?.invoice || !isPendingDepositStatus(activationDeposit.status)) return;
      const response = await premiuminApi.depositStatus(activationDeposit.invoice, apiKey || undefined);
      setActivationDeposit(response.data);
      if (response.data.status === 'success') {
        const meResponse = await premiuminApi.me(apiKey || undefined);
        setMe(meResponse.data);
        window.dispatchEvent(new Event('premiuminplus:balance-updated'));
      }
    },
    15000,
    {
      enabled: Boolean(activationDeposit?.invoice && isPendingDepositStatus(activationDeposit.status)),
      immediate: false,
      pauseWhenHidden: true,
      focusThrottleMs: 10000,
    },
  );

  const save = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await premiuminApi.updateMyBotSettings(settings, apiKey || undefined);
      await persistMargin(marginDraft, true);
      setSettings(response.data);
      setSuccess('Bot settings dan margin up tersimpan.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan setting bot.');
    } finally {
      setSaving(false);
    }
  };

  const saveMargin = async () => {
    setError('');
    setSuccess('');
    await persistMargin(marginDraft);
  };

  const connectBot = async () => {
    setSessionLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await premiuminApi.botSessionConnect(apiKey || undefined);
      setBotStatus(response.data);
      setSuccess(response.data.qr ? 'QR bot dibuat. Scan dari WhatsApp pribadi kamu.' : 'Session bot aktif.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menghubungkan bot.');
    } finally {
      setSessionLoading(false);
    }
  };

  const startActivation = async () => {
    setActivationLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await premiuminApi.botActivationDeposit(apiKey || undefined);
      setActivationDeposit(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal membuat QR aktivasi bot.');
    } finally {
      setActivationLoading(false);
    }
  };

  if (!botUnlocked) {
    const qrValue = activationDeposit?.qr_image || activationDeposit?.qr_raw || activationDeposit?.qr_data || '';
    const qrSource = qrValue ? (qrValue.startsWith('data:') ? qrValue : `data:image/png;base64,${qrValue}`) : '';

    return (
      <div className="bot-wa space-y-4">
        <PageHero
          title="Bot WhatsApp"
          subtitle="Fitur premium terkunci sampai locked balance aktif."
          slogan="Aktivasi ringan, saldo tetap milik kamu, dan bisa ditarik kembali."
          tone="from-amber-500/15 via-brand/10 to-cyan-500/10"
          chips={['Premium', 'QRIS', 'Locked balance']}
        />

        <PageSection title="Fitur Bot WhatsApp Terkunci" subtitle="Akses premium bot">
          <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
            <NeonCard>
              <p className="text-2xl font-black text-white">FITUR BOT WHATSAPP TERKUNCI</p>
              <p className="mt-4 text-sm leading-6 text-white/65">
                Untuk membuka akses Bot WhatsApp, anda harus memiliki saldo minimum {formatCurrency(50000)}.
                Saldo ini digunakan sebagai akses premium bot, menjaga kestabilan layanan bot, dan menjaga session tetap aktif.
              </p>
              <p className="mt-3 text-sm leading-6 text-emerald-200">
                Saldo tetap milik anda dan tetap bisa ditarik kembali melalui menu Withdraw.
              </p>
              <div className="mt-5 grid gap-2 text-sm text-white/70">
                {['Auto respon pembeli', 'Auto kirim QRIS', 'Auto kirim akun', 'Multi transaksi realtime', 'Bot pribadi', 'Harga jual sendiri'].map((item) => (
                  <span key={item} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">{item}</span>
                ))}
              </div>
              {error ? <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
              {me?.bot_disabled_reason ? (
                <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
                  BOT DINONAKTIFKAN<br />
                  {me.bot_disabled_reason}. Silahkan topup saldo kembali agar bot aktif otomatis.
                </div>
              ) : null}
              <button onClick={startActivation} disabled={activationLoading} className="mt-5 w-full rounded-2xl bg-brand px-4 py-3 text-sm font-black text-white shadow-lg shadow-brand/20 disabled:opacity-60">
                {activationLoading ? 'Membuat QRIS...' : 'Buka Bot Sekarang'}
              </button>
            </NeonCard>

            <NeonCard>
              <p className="text-sm font-black text-white">Bot WhatsApp Activation</p>
              <p className="mt-2 text-3xl font-black text-white">{formatCurrency(50000)}</p>
              {!activationDeposit ? <p className="mt-3 text-sm leading-6 text-white/55">Klik tombol aktivasi untuk membuat QRIS fixed amount.</p> : null}
              {activationDeposit ? (
                <div className="mt-4 space-y-3">
                  <p className="text-xs text-white/45">{activationDeposit.invoice}</p>
                  <p className="text-sm font-bold text-white">Status: {activationDeposit.status}</p>
                  {qrSource && isPendingDepositStatus(activationDeposit.status) ? (
                    <div className="rounded-2xl bg-white p-3">
                      <img src={qrSource} alt="QRIS Bot Activation" className="aspect-square w-full rounded-xl object-contain" />
                    </div>
                  ) : null}
                  {activationDeposit.status === 'success' ? (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                      Bot berhasil dibuka. Panel bot aktif otomatis.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </NeonCard>
          </div>
        </PageSection>
      </div>
    );
  }

  const logoutBot = async () => {
    setSessionLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await premiuminApi.botSessionLogout(apiKey || undefined);
      setBotStatus(response.data);
      setSuccess('Session bot dihapus. Connect ulang untuk membuat QR baru.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal logout bot.');
    } finally {
      setSessionLoading(false);
    }
  };

  return (
    <div className="bot-wa space-y-4">
      <PageHero
        title="Bot Wa Setting"
        subtitle="WhatsApp bot, margin jual, dan API key dalam satu panel ringan."
        slogan="Margin tersimpan otomatis dan sinkron ke database."
        tone="from-cyan-500/15 via-emerald-500/10 to-brand/10"
        chips={['WA ready', 'Margin realtime', 'API']}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <PageSection title="Bot bisnis digital" subtitle="Status, QR, dan identitas toko">
          <div className="space-y-3">
            {loading ? <p className="text-sm text-white/45">Memuat setting bot...</p> : null}
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
              <div>
                <p className="text-sm font-black text-white">{botStatus?.connected ? 'BOT ACTIVE' : 'BOT BELUM CONNECT'}</p>
                <p className="mt-1 text-xs text-white/45">Session: {botStatus?.status || 'idle'}</p>
              </div>
              <ToggleRight className={`h-7 w-7 ${botStatus?.connected ? 'text-emerald-300' : 'text-white/25'}`} />
            </div>
            <input
              value={settings.panel_name || ''}
              onChange={(event) => setSettings((current) => ({ ...current, panel_name: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Nama panel bot"
            />
            <input
              value={settings.greeting_message}
              onChange={(event) => setSettings((current) => ({ ...current, greeting_message: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Greeting message"
            />
            <input
              value={settings.keyword_response || ''}
              onChange={(event) => setSettings((current) => ({ ...current, keyword_response: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Balasan keyword greeting"
            />
            <input
              value={settings.footer_message || ''}
              onChange={(event) => setSettings((current) => ({ ...current, footer_message: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Footer bot"
            />
            <div className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-white">Auto Reply</span>
                <button type="button" onClick={() => setSettings((current) => ({ ...current, auto_reply_enabled: !current.auto_reply_enabled }))} className="text-brand">
                  <ToggleRight className={`h-7 w-7 ${settings.auto_reply_enabled ? 'text-brand' : 'rotate-180 text-white/25'}`} />
                </button>
              </div>
            </div>
            {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
            {success ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}
            <button onClick={save} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 disabled:opacity-60">
              <Save className="h-4 w-4" />
              {saving ? 'Menyimpan...' : 'Simpan Setting Bot'}
            </button>
          </div>
        </PageSection>

        <PageSection title="Session WhatsApp" subtitle="QR login dan status realtime">
          <div className="space-y-3">
            <NeonCard>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-white">Status Bot</p>
                  <p className="mt-1 text-xs text-white/45">{botStatus?.status || 'bot-engine belum tersambung'}</p>
                  {botStatus?.connected_number ? <p className="mt-2 text-xs font-bold text-emerald-300">{botStatus.connected_number}</p> : null}
                  {botStatus?.last_active ? <p className="mt-1 text-xs text-white/35">Last active: {botStatus.last_active}</p> : null}
                </div>
                <Wifi className={`h-5 w-5 ${botStatus?.connected ? 'text-emerald-300' : 'text-white/30'}`} />
              </div>
            </NeonCard>
            {botStatus?.qr ? (
              <div className="rounded-2xl border border-white/10 bg-white p-3">
                <img src={botStatus.qr} alt="QR WhatsApp Bot" className="aspect-square w-full rounded-xl object-contain" />
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <button onClick={connectBot} disabled={sessionLoading} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 disabled:opacity-60">
                {botStatus?.qr ? <RefreshCw className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
                {sessionLoading ? 'Memproses...' : botStatus?.connected ? 'Refresh Status' : 'Connect Bot'}
              </button>
              <button onClick={logoutBot} disabled={sessionLoading} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200 disabled:opacity-60">
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        </PageSection>

        <PageSection title="Margin Naik & API" subtitle="Atur margin bot">
          <div className="space-y-3">
            <NeonCard>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Store className="h-5 w-5 text-brand" />
                  <p className="mt-3 text-sm font-black text-white">Margin Naik</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-white">
                  {marginDraft}%
                </span>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={marginDraft}
                  onChange={(event) => {
                    const next = Math.max(0, Math.min(100, Number(event.target.value)));
                    marginDesired.current = next;
                    setMarginDraft(next);
                  }}
                  className="w-full accent-brand"
                  aria-label="Margin bot"
                />
              </div>
            </NeonCard>
            <button onClick={saveMargin} disabled={marginSaving} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 disabled:opacity-60">
              <Save className="h-4 w-4" />
              {marginSaving ? 'Menyimpan...' : 'Atur Margin Simpan'}
            </button>
            <NeonCard>
              <KeyRound className="h-5 w-5 text-brand" />
              <p className="mt-3 text-sm font-black text-white">API Key</p>
              <p className="mt-2 break-all rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-white/65">{apiKeyMasked}</p>
            </NeonCard>
            <NeonCard>
              <Bot className="h-5 w-5 text-brand" />
              <p className="mt-3 text-sm leading-6 text-white/55">Command aktif: greeting, stok/list, buy code, cancel invoice, dan cek invoice.</p>
            </NeonCard>
          </div>
        </PageSection>
      </div>

    </div>
  );
}
