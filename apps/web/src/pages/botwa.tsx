import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, CheckCircle2, CircleDollarSign, KeyRound, LogOut, QrCode, RefreshCw, Save, ScanLine, ShieldCheck, Smartphone, Store, ToggleRight, Wifi } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from './dashboardPageKit';
import { getApiKey } from '../store/useAuth';
import { premiuminApi, type BotSettingsRecord, type DepositRecord, type MeRecord } from '../services/api';
import { useStablePolling } from '../hooks/useStablePolling';
import { formatCurrency } from '../utils/format';
import { BotActivationPanel } from '../components/bot/BotActivationPanel';

const fallback: BotSettingsRecord = {
  brand_name: 'PREMIUMIN PLUS BOT',
  greeting_hooks: 'p,ping,halo,haloo,bro',
  welcome_message: 'Selamat datang, silakan berbelanja.',
  admin_whatsapp: '',
  operational_hours: '08.00 - 21.00 WIB',
  closing_message: 'Kepuasan pelanggan adalah prioritas kami.',
  catalog_template: 'template_1',
  order_template: 'template_1',
  terms_text: 'Simpan data akun baik-baik. Garansi mengikuti ketentuan produk.',
  reseller_margin_type: 'percent',
  reseller_margin_value: 10,
  is_active: true,
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
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof premiuminApi.botAnalytics>>['data'] | null>(null);
  const [activationDeposit, setActivationDeposit] = useState<DepositRecord | null>(null);
  const [activationLoading, setActivationLoading] = useState(false);
  const [activationChecking, setActivationChecking] = useState(false);
  const [showActivationQr, setShowActivationQr] = useState(false);
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
          premiuminApi.resellerBotSettings(apiKey || undefined),
          premiuminApi.me(apiKey || undefined),
        ]);
        if (!active) return;
        const resolvedMargin = Number(response.data.reseller_margin_value ?? meResponse.data.reseller_margin_percent ?? meResponse.data.markup_percent ?? 0);
        setMe(meResponse.data);
        setSettings(response.data);
        setMarginDraft(resolvedMargin);
        marginDesired.current = resolvedMargin;
        setPersistedMargin(resolvedMargin);
        setApiKeyMasked(meResponse.data.api_key ? `${meResponse.data.api_key.slice(0, 10)}...${meResponse.data.api_key.slice(-6)}` : '-');
        premiuminApi.deposits(apiKey || undefined)
          .then((depositResponse) => {
            if (!active) return;
            const latestActivation = depositResponse.data.find((item) => item.payment_type === 'bot_activation' && isPendingDepositStatus(item.status));
            if (latestActivation) setActivationDeposit(latestActivation);
          })
          .catch(() => {
            if (active) setActivationDeposit(null);
          });
        premiuminApi.botAnalytics(apiKey || undefined)
          .then((analyticsResponse) => {
            if (active) setAnalytics(analyticsResponse.data);
          })
          .catch(() => {
            if (active) setAnalytics(null);
          });
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
    if (settings.reseller_margin_type !== 'percent') return;
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

  const checkActivationDeposit = useCallback(async (invoice = activationDeposit?.invoice, silent = false) => {
    if (!invoice || activationChecking) return;
    setActivationChecking(true);
    if (!silent) {
      setError('');
      setSuccess('');
    }
    try {
      const response = await premiuminApi.depositStatus(invoice, apiKey || undefined);
      setActivationDeposit(response.data);
      if (response.data.status === 'success') {
        const meResponse = await premiuminApi.me(apiKey || undefined);
        setMe(meResponse.data);
        setShowActivationQr(false);
        setSuccess('Aktivasi Bot WhatsApp berhasil. Dashboard bot sudah aktif.');
        window.dispatchEvent(new Event('premiuminplus:balance-updated'));
      }
    } catch (caught) {
      if (!silent) setError(caught instanceof Error ? caught.message : 'Gagal mengecek pembayaran aktivasi.');
    } finally {
      setActivationChecking(false);
    }
  }, [activationChecking, activationDeposit?.invoice, apiKey]);

  useStablePolling(
    async () => {
      if (!activationDeposit?.invoice || !isPendingDepositStatus(activationDeposit.status)) return;
      await checkActivationDeposit(activationDeposit.invoice, true);
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
      const response = await premiuminApi.updateResellerBotSettings(settings, apiKey || undefined);
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
    setMarginSaving(true);
    try {
      const response = await premiuminApi.updateResellerBotSettings({
        reseller_margin_type: settings.reseller_margin_type || 'percent',
        reseller_margin_value: marginDraft,
      }, apiKey || undefined);
      setSettings(response.data);
      if ((response.data.reseller_margin_type || settings.reseller_margin_type) === 'percent') {
        await persistMargin(marginDraft, true);
      }
      setSuccess('Margin bot tersimpan.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan margin bot.');
    } finally {
      setMarginSaving(false);
    }
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
    if (activationDeposit?.invoice && isPendingDepositStatus(activationDeposit.status)) {
      setShowActivationQr(true);
      return;
    }
    setActivationLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await premiuminApi.botActivationDeposit(apiKey || undefined);
      setActivationDeposit(response.data);
      setShowActivationQr(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal membuat QR aktivasi bot.');
    } finally {
      setActivationLoading(false);
    }
  };

  if (!botUnlocked) {
    const cancelActivation = async () => {
      if (!activationDeposit?.invoice || !isPendingDepositStatus(activationDeposit.status)) return;
      setActivationLoading(true);
      setError('');
      try {
        const response = await premiuminApi.depositCancel(activationDeposit.invoice, apiKey || undefined);
        setActivationDeposit(response.data);
        setShowActivationQr(false);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Gagal membatalkan QR aktivasi.');
      } finally {
        setActivationLoading(false);
      }
    };

    return (
      <div className="bot-wa space-y-4">
        <PageHero
          title="Bot WhatsApp"
          subtitle="Aktivasi automation WhatsApp premium untuk reseller."
          slogan="Locked balance tetap milik Anda dan dapat ditarik kembali melalui Withdraw."
          tone="from-brand/15 via-fuchsia-500/10 to-cyan-500/10"
          chips={['Activation', 'QRIS', 'Locked balance']}
        />

        {me?.bot_disabled_reason ? (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
            BOT DINONAKTIFKAN<br />
            {me.bot_disabled_reason}. Silakan top up saldo kembali agar bot aktif otomatis.
          </div>
        ) : null}

        <BotActivationPanel
          activationDeposit={activationDeposit}
          activationLoading={activationLoading}
          checking={activationChecking}
          error={error}
          me={me}
          showQr={showActivationQr}
          onCancel={cancelActivation}
          onCheck={() => void checkActivationDeposit()}
          onCloseQr={() => setShowActivationQr(false)}
          onOpenQr={() => {
            if (activationDeposit?.invoice && isPendingDepositStatus(activationDeposit.status)) setShowActivationQr(true);
          }}
          onStart={startActivation}
        />
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

  const sessionStatus = String(botStatus?.status || 'idle').toLowerCase();
  const sessionConnected = Boolean(botStatus?.connected);
  const hasQr = Boolean(botStatus?.qr);
  const sessionLabel = sessionConnected ? 'Connected' : hasQr ? 'Menunggu scan QR' : sessionStatus === 'logged_out' ? 'Logged out' : 'Belum connect';
  const sessionDescription = sessionConnected
    ? 'Bot siap menerima chat pembeli dan membuat QRIS melalui backend Premiumin Plus.'
    : hasQr
      ? 'Scan barcode ini dari WhatsApp agar session terhubung ke akun reseller.'
      : sessionStatus === 'logged_out'
        ? 'Session sudah logout. Klik connect untuk membuat QR login baru.'
        : 'Klik connect untuk membuat QR login WhatsApp.';
  const previewModal = 12_000;
  const marginType = settings.reseller_margin_type || 'percent';
  const previewMarkup = marginType === 'fixed' ? Math.round(Number(marginDraft || 0)) : Math.round((previewModal * Number(marginDraft || 0)) / 100);
  const previewTotal = previewModal + previewMarkup;

  return (
    <div className="bot-wa space-y-4">
      <PageHero
        title="Bot WhatsApp"
        subtitle="Kelola session, margin jual, dan identitas toko WhatsApp reseller."
        slogan="Semua order, QRIS, mutasi, dan profit tetap diproses backend agar saldo tidak mismatch."
        tone="from-cyan-500/15 via-emerald-500/10 to-brand/10"
        chips={['Connect QR', 'Margin sinkron', 'Wallet-safe']}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <PageSection title="Pengaturan Bot" subtitle="Branding, hooks, template, dan syarat">
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
              value={settings.brand_name || settings.panel_name || ''}
              onChange={(event) => setSettings((current) => ({ ...current, brand_name: event.target.value, panel_name: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Nama branding bot"
            />
            <input
              value={settings.admin_whatsapp || ''}
              onChange={(event) => setSettings((current) => ({ ...current, admin_whatsapp: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Nomor admin/owner WhatsApp"
            />
            <input
              value={settings.operational_hours || ''}
              onChange={(event) => setSettings((current) => ({ ...current, operational_hours: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Jam operasional"
            />
            <input
              value={settings.greeting_hooks || ''}
              onChange={(event) => setSettings((current) => ({ ...current, greeting_hooks: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Hooks: p,ping,halo,bro"
            />
            <p className="-mt-1 px-1 text-xs text-white/35">Pisahkan kata dengan koma. Contoh: p,ping,halo,bro</p>
            <textarea
              value={settings.welcome_message || settings.greeting_message || ''}
              onChange={(event) => setSettings((current) => ({ ...current, welcome_message: event.target.value, greeting_message: event.target.value }))}
              className="min-h-24 w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Kata pembuka"
            />
            <textarea
              value={settings.closing_message || settings.footer_message || ''}
              onChange={(event) => setSettings((current) => ({ ...current, closing_message: event.target.value, footer_message: event.target.value }))}
              className="min-h-20 w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Kata penutup"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={settings.catalog_template || 'template_1'}
                onChange={(event) => setSettings((current) => ({ ...current, catalog_template: event.target.value as BotSettingsRecord['catalog_template'] }))}
                className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              >
                <option value="template_1">Template Katalog 1</option>
                <option value="template_2">Template Katalog 2</option>
                <option value="template_3">Template Katalog 3</option>
              </select>
              <select
                value={settings.order_template || 'template_1'}
                onChange={(event) => setSettings((current) => ({ ...current, order_template: event.target.value as BotSettingsRecord['order_template'] }))}
                className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              >
                <option value="template_1">Template Order 1</option>
                <option value="template_2">Template Order 2</option>
                <option value="template_3">Template Order 3</option>
              </select>
            </div>
            <textarea
              value={settings.terms_text || ''}
              onChange={(event) => setSettings((current) => ({ ...current, terms_text: event.target.value }))}
              className="min-h-24 w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Syarat & ketentuan yang dikirim setelah credential sukses"
            />
            <div className="rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-white">Bot Aktif</span>
                <button type="button" onClick={() => setSettings((current) => ({ ...current, is_active: !current.is_active, enabled: !current.is_active, auto_reply_enabled: !current.is_active }))} className="text-brand">
                  <ToggleRight className={`h-7 w-7 ${settings.is_active ? 'text-brand' : 'rotate-180 text-white/25'}`} />
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

        <PageSection title="Session WhatsApp" subtitle="Connect, scan QR, dan logout manual">
          <div className="space-y-3">
            <NeonCard>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${sessionConnected ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : hasQr ? 'border-amber-500/20 bg-amber-500/10 text-amber-200' : 'border-white/10 bg-white/5 text-white/55'}`}>
                    {sessionConnected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
                    {sessionLabel}
                  </span>
                  <p className="mt-3 text-sm font-black text-white">Status Bot</p>
                  <p className="mt-1 text-xs leading-5 text-white/50">{sessionDescription}</p>
                  {botStatus?.connected_number ? <p className="mt-2 break-all text-xs font-bold text-emerald-300">Nomor: {botStatus.connected_number}</p> : null}
                  {botStatus?.last_active ? <p className="mt-1 text-xs text-white/35">Last active: {botStatus.last_active}</p> : null}
                </div>
                <Smartphone className={`h-6 w-6 shrink-0 ${sessionConnected ? 'text-emerald-300' : hasQr ? 'text-amber-200' : 'text-white/30'}`} />
              </div>
            </NeonCard>

            {hasQr ? (
              <div className="rounded-2xl border border-brand/20 bg-[#0b0f1a] p-3 shadow-lg shadow-brand/10">
                <div className="rounded-xl border border-white/10 bg-white p-3">
                  <img src={botStatus?.qr || ''} alt="QR WhatsApp Bot" className="mx-auto aspect-square w-full max-w-[320px] rounded-lg object-contain" />
                </div>
                <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-3 text-xs leading-5 text-cyan-100">
                  <p className="flex items-center gap-2 font-black text-white">
                    <ScanLine className="h-4 w-4" />
                    Scan barcode ini
                  </p>
                  <p className="mt-1 text-cyan-100/75">Buka WhatsApp, pilih Perangkat tertaut, lalu scan QR. Jangan logout kecuali ingin mengganti nomor.</p>
                </div>
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <button onClick={connectBot} disabled={sessionLoading} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 disabled:opacity-60">
                {sessionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                {sessionLoading ? 'Memproses...' : sessionConnected ? 'Refresh Status' : hasQr ? 'Generate Ulang QR' : 'Connect Bot'}
              </button>
              <button onClick={logoutBot} disabled={sessionLoading || (!sessionConnected && !hasQr)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200 disabled:opacity-50">
                <LogOut className="h-4 w-4" />
                Logout Session
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="flex items-center gap-2 text-sm font-black text-white">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                Validasi aman
              </p>
              <p className="mt-2 text-xs leading-5 text-white/50">Bot hanya mengirim request ke backend. Validasi saldo, QRIS, order, mutasi, dan profit tetap diproses web-core agar tidak ada mismatch.</p>
            </div>
          </div>
        </PageSection>

        <PageSection title="Margin Naik & API" subtitle="Atur margin bot">
          <div className="space-y-3">
            <NeonCard>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Store className="h-5 w-5 text-brand" />
                  <p className="mt-3 text-sm font-black text-white">Margin Bot</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black text-white">
                  {marginType === 'fixed' ? formatCurrency(marginDraft) : `${marginDraft}%`}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr]">
                <select
                  value={marginType}
                  onChange={(event) => {
                    const nextType = event.target.value as BotSettingsRecord['reseller_margin_type'];
                    setSettings((current) => ({ ...current, reseller_margin_type: nextType }));
                    const next = nextType === 'fixed' ? 500 : Math.min(Number(marginDraft || 10), 100);
                    marginDesired.current = next;
                    setMarginDraft(next);
                    setSettings((current) => ({ ...current, reseller_margin_type: nextType, reseller_margin_value: next }));
                  }}
                  className="rounded-xl border border-white/10 bg-[#0b0f1a] px-3 py-3 text-sm font-bold text-white outline-none focus:border-brand/50"
                >
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed</option>
                </select>
                <input
                  type="number"
                  min={0}
                  max={marginType === 'fixed' ? 1000000 : 100}
                  step={marginType === 'fixed' ? 100 : 1}
                  value={marginDraft}
                  onChange={(event) => {
                    const max = marginType === 'fixed' ? 1000000 : 100;
                    const next = Math.max(0, Math.min(max, Number(event.target.value)));
                    marginDesired.current = next;
                    setMarginDraft(next);
                    setSettings((current) => ({ ...current, reseller_margin_value: next }));
                  }}
                  className="rounded-xl border border-white/10 bg-[#0b0f1a] px-3 py-3 text-sm font-bold text-white outline-none focus:border-brand/50"
                  aria-label="Margin bot"
                />
              </div>
            </NeonCard>
            <NeonCard>
              <CircleDollarSign className="h-5 w-5 text-emerald-300" />
              <p className="mt-3 text-sm font-black text-white">Simulasi harga WA</p>
              <div className="mt-3 grid gap-2 text-xs text-white/55 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="font-bold uppercase tracking-[0.14em] text-white/35">Modal reseller</p>
                  <p className="mt-1 text-sm font-black text-white">{formatCurrency(previewModal)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="font-bold uppercase tracking-[0.14em] text-white/35">Margin {marginType === 'fixed' ? 'fixed' : `${marginDraft}%`}</p>
                  <p className="mt-1 text-sm font-black text-emerald-200">{formatCurrency(previewMarkup)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="font-bold uppercase tracking-[0.14em] text-white/35">Harga bot</p>
                  <p className="mt-1 text-sm font-black text-brand">{formatCurrency(previewTotal)}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-white/45">
                Saat buyer bayar via WhatsApp, QRIS memakai harga bot. Setelah sukses, transaksi menyimpan modal reseller, harga jual bot, dan profit margin; wallet reseller hanya dikredit profit agar saldo tidak dobel.
              </p>
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

        <PageSection title="Analytics Bot" subtitle="Ringkasan transaksi WhatsApp">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['Order bot', analytics?.total_order_bot || 0],
              ['Pembayaran masuk', formatCurrency(analytics?.total_pembayaran_masuk || 0)],
              ['Modal keluar', formatCurrency(analytics?.total_modal_keluar || 0)],
              ['Profit', formatCurrency(analytics?.total_profit || 0)],
              ['Transaksi sukses', analytics?.total_transaksi_sukses || 0],
              ['Pending payment', analytics?.pending_payment || 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">{label}</p>
                <p className="mt-2 text-lg font-black text-white">{value}</p>
              </div>
            ))}
          </div>
        </PageSection>
      </div>

    </div>
  );
}
