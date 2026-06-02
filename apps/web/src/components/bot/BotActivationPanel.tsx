import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  LockKeyhole,
  QrCode,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { DepositRecord, MeRecord } from '../../services/api';
import { formatCurrency } from '../../utils/format';

const ACTIVATION_AMOUNT = 50000;

function isPendingDepositStatus(status?: string | null) {
  return ['pending', 'pending_payment'].includes(String(status || '').toLowerCase());
}

function isSuccessDepositStatus(status?: string | null) {
  return String(status || '').toLowerCase() === 'success';
}

function renderQrSource(value?: string | null) {
  if (!value) return '';
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

function formatCountdown(seconds: number) {
  const safe = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secondsRest = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secondsRest).padStart(2, '0')}`;
  return `${minutes}:${String(secondsRest).padStart(2, '0')}`;
}

function statusLabel(status?: string | null) {
  if (isSuccessDepositStatus(status)) return 'Success';
  if (isPendingDepositStatus(status)) return 'Pending';
  if (String(status || '').toLowerCase() === 'canceled') return 'Canceled';
  if (String(status || '').toLowerCase() === 'expired') return 'Expired';
  return status || 'Pending';
}

interface BotActivationPanelProps {
  activationDeposit: DepositRecord | null;
  activationLoading: boolean;
  checking: boolean;
  error: string;
  me: MeRecord | null;
  showQr: boolean;
  onCancel: () => void;
  onCheck: () => void;
  onCloseQr: () => void;
  onOpenQr: () => void;
  onStart: () => void;
}

export function BotActivationPanel({
  activationDeposit,
  activationLoading,
  checking,
  error,
  me,
  showQr,
  onCancel,
  onCheck,
  onCloseQr,
  onOpenQr,
  onStart,
}: BotActivationPanelProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const expiryAutoCheckRef = useRef('');

  const saldo = Number(me?.saldo || 0);
  const lockedBalance = Number(me?.locked_balance || 0);
  const botActive = Boolean(me?.bot_access_unlocked && lockedBalance >= ACTIVATION_AMOUNT && saldo >= lockedBalance);
  const shortage = Math.max(ACTIVATION_AMOUNT - saldo, 0);
  const qrValue = activationDeposit?.qr_image || activationDeposit?.qr_raw || activationDeposit?.qr_data || '';
  const qrSource = renderQrSource(qrValue);
  const pending = Boolean(activationDeposit && isPendingDepositStatus(activationDeposit.status));
  const success = Boolean(botActive || isSuccessDepositStatus(activationDeposit?.status));

  useEffect(() => {
    if (!activationDeposit?.expired_at || !pending) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      const next = Math.max(0, Math.floor((new Date(activationDeposit.expired_at || '').getTime() - Date.now()) / 1000));
      setSecondsLeft(Number.isFinite(next) ? next : 0);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [activationDeposit?.expired_at, pending]);

  useEffect(() => {
    if (!activationDeposit?.invoice || !pending || secondsLeft > 0) return;
    if (expiryAutoCheckRef.current === activationDeposit.invoice) return;
    const expiry = new Date(activationDeposit.expired_at || '').getTime();
    if (!Number.isFinite(expiry) || expiry > Date.now()) return;
    expiryAutoCheckRef.current = activationDeposit.invoice;
    onCheck();
  }, [activationDeposit?.expired_at, activationDeposit?.invoice, onCheck, pending, secondsLeft]);

  const benefits = [
    'Auto respon pembeli',
    'Auto kirim QRIS',
    'Auto kirim akun',
    'Auto proses transaksi',
    'Bot pribadi milik reseller',
    'Multi transaksi realtime',
    'Session aman',
    'Login QR WhatsApp',
    'Reconnect otomatis',
    'Harga jual sendiri',
  ];

  const paymentMethods = ['ShopeePay', 'Dana', 'OVO', 'GoPay', 'Mobile Banking', 'QRIS Bank'];

  if (success) {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 shadow-[0_18px_60px_rgba(16,185,129,0.08)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                Active
              </span>
              <h2 className="mt-4 text-2xl font-black text-white">Aktivasi Berhasil</h2>
              <p className="mt-2 text-sm leading-6 text-white/65">Bot Premium aktif. Dashboard bot siap digunakan untuk session WhatsApp, QR login, dan automation order.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Locked Balance</p>
              <p className="mt-2 text-2xl font-black text-white">{formatCurrency(Math.max(lockedBalance, ACTIVATION_AMOUNT))}</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-brand/20 bg-[#0b0f1a]/95 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(255,47,146,0.16),rgba(14,165,233,0.08))] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brand/90">Premium access</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Aktivasi Bot WhatsApp</h2>
              <p className="mt-3 text-sm leading-6 text-white/65">
                Gunakan Bot WhatsApp Premium untuk menjalankan bisnis otomatis, menerima order, mengirim QRIS, dan mengirim akun secara otomatis.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-rose-400/25 bg-rose-400/10 px-3 py-1.5 text-xs font-black text-rose-200">
              <LockKeyhole className="h-3.5 w-3.5" />
              Belum Aktif
            </span>
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[0.95fr_1.05fr] lg:p-5">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2 text-amber-200">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-sm font-black">{shortage > 0 ? 'Saldo Anda Kurang' : 'Siap Aktivasi'}</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/62">
                Untuk menggunakan Bot WhatsApp Premium, Anda harus memiliki saldo minimal {formatCurrency(ACTIVATION_AMOUNT)} sebagai locked balance.
                Saldo ini tetap milik Anda dan tetap bisa ditarik kembali melalui menu Withdraw.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Saldo Saat Ini</p>
                <p className="mt-2 text-xl font-black text-white">{formatCurrency(saldo)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Minimal Saldo</p>
                <p className="mt-2 text-xl font-black text-white">{formatCurrency(ACTIVATION_AMOUNT)}</p>
              </div>
              <div className={`rounded-2xl border p-4 ${shortage > 0 ? 'border-rose-500/20 bg-rose-500/10' : 'border-emerald-500/20 bg-emerald-500/10'}`}>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/38">Kurang</p>
                <p className="mt-2 text-xl font-black text-white">{formatCurrency(shortage)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-sm font-black text-white">Keunggulan Bot</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {benefits.map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-sm text-white/72">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-200">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/38">Ringkasan Aktivasi</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <span className="text-white/62">Aktivasi Bot WhatsApp</span>
                  <span className="font-black text-white">{formatCurrency(ACTIVATION_AMOUNT)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <span className="text-white/62">Locked Balance</span>
                  <span className="font-black text-white">{formatCurrency(ACTIVATION_AMOUNT)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white/62">Status</span>
                  <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-rose-200">Belum Aktif</span>
                </div>
              </div>
            </div>

            <button type="button" onClick={onOpenQr} className={`w-full rounded-2xl border p-4 text-left transition ${pending ? 'border-amber-500/25 bg-amber-500/10 hover:bg-amber-500/15' : 'border-white/10 bg-white/[0.035]'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-white">{pending ? 'Aktivasi Bot Pending' : 'Metode Pembayaran'}</p>
                  <p className="mt-1 break-all text-xs text-white/45">{pending ? activationDeposit?.invoice : 'QRIS (All Payment)'}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-white/40" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(pending ? ['Menunggu Pembayaran', statusLabel(activationDeposit?.status)] : paymentMethods).map((item) => (
                  <span key={item} className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-bold text-white/55">{item}</span>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-white/45">Deposit akan masuk sebagai locked balance dan digunakan untuk membuka akses Bot WhatsApp Premium.</p>
            </button>

            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-white/72">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 accent-brand" />
              <span>Saya setuju melakukan deposit {formatCurrency(ACTIVATION_AMOUNT)} untuk aktivasi Bot WhatsApp Premium.</span>
            </label>

            {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

            <button
              type="button"
              onClick={pending ? onOpenQr : onStart}
              disabled={activationLoading || (!pending && !confirmed)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-black text-white shadow-lg shadow-brand/20 disabled:opacity-60"
            >
              {activationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              {pending ? 'Buka QR Pending' : 'Bayar Sekarang (QRIS)'}
            </button>

            {pending ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={onOpenQr} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/75">Bayar</button>
                <button type="button" onClick={onCheck} disabled={checking} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-100 disabled:opacity-60">
                  {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Cek Status
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {showQr && activationDeposit ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:grid sm:place-items-center sm:p-4" onClick={onCloseQr}>
          <div className="max-h-[96dvh] w-full overflow-y-auto rounded-t-[1.4rem] border border-brand/20 bg-[#0d0912] shadow-2xl shadow-brand/20 sm:max-h-[90dvh] sm:w-[min(80vw,720px)] sm:rounded-[1.4rem]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-black text-white">QRIS Aktivasi Bot</p>
                <p className="break-all text-xs text-white/40">Invoice: {activationDeposit.invoice}</p>
              </div>
              <button type="button" onClick={onCloseQr} className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-white/65">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
              <div className={`rounded-[1.2rem] border p-3 ${pending && qrSource ? 'border-white/10 bg-white' : 'border-white/10 bg-white/5'}`}>
                {pending && qrSource ? (
                  <img src={qrSource} alt="QRIS Aktivasi Bot" className="mx-auto aspect-square w-full max-w-[230px] rounded-xl object-contain" />
                ) : (
                  <div className="mx-auto grid aspect-square w-full max-w-[230px] place-items-center rounded-xl bg-black/20 px-4 text-center text-sm font-bold text-white/60">
                    {isSuccessDepositStatus(activationDeposit.status) ? 'QR disembunyikan setelah sukses' : 'QR tidak aktif'}
                  </div>
                )}
              </div>

              <div className="min-w-0 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Nominal</p>
                  <p className="mt-1 text-2xl font-black text-white">{formatCurrency(activationDeposit.amount || ACTIVATION_AMOUNT)}</p>
                  <div className="mt-3 grid gap-2 text-xs text-white/55 sm:grid-cols-2">
                    <span>Status: <b className="text-white">{statusLabel(activationDeposit.status)}</b></span>
                    <span>Countdown: <b className="text-amber-200">{pending ? formatCountdown(secondsLeft) : '-'}</b></span>
                  </div>
                </div>

                {isSuccessDepositStatus(activationDeposit.status) ? (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    <p className="font-black">Aktivasi Berhasil</p>
                    <p className="mt-1">Locked Balance: {formatCurrency(ACTIVATION_AMOUNT)}</p>
                    <p>Bot Premium Aktif.</p>
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-white/55">Scan QRIS dan cek pembayaran berkala. Jika pembayaran sukses, dashboard bot akan otomatis terbuka.</p>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={onCheck} disabled={!pending || checking} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-black text-white disabled:opacity-60">
                    {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Cek Pembayaran
                  </button>
                  <button type="button" onClick={onCancel} disabled={!pending || activationLoading} className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200 disabled:opacity-50">
                    Batalkan
                  </button>
                </div>

                <div className="flex items-center justify-center gap-2 text-xs text-white/35">
                  <LockKeyhole className="h-3.5 w-3.5" />
                  Transaksi aman dan terenkripsi
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
