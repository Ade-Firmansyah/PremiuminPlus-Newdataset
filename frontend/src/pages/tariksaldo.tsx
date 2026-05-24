import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, CheckCircle2, Clock3, CreditCard, Landmark, Send, Smartphone, User, XCircle } from 'lucide-react';
import { PageSection, NeonCard } from './dashboardPageKit';
import { formatCurrency } from '../utils/format';
import { getApiKey } from '../store/useAuth';
import { premiuminApi, type WithdrawRecord } from '../services/api';

const WITHDRAW_METHODS = [
  { value: 'BRI', label: 'Bank BRI', icon: Landmark },
  { value: 'SEABANK', label: 'SeaBank', icon: Landmark },
  { value: 'GOPAY', label: 'GoPay', icon: Smartphone },
  { value: 'SHOPEEPAY', label: 'ShopeePay', icon: Smartphone },
];
const MIN_WITHDRAW = 50000;

function calculateFee(amount: number) {
  if (amount <= 0) return 0;
  if (amount <= 50000) return 500;
  if (amount <= 200000) return 1000;
  return Math.ceil(amount * 0.02);
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusTone(status?: string) {
  const normalized = String(status || 'pending').toLowerCase();
  if (['paid', 'success', 'approved', 'completed'].includes(normalized)) {
    return {
      label: normalized === 'paid' ? 'Berhasil' : normalized,
      className: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
      icon: CheckCircle2,
    };
  }
  if (['rejected', 'failed', 'cancelled'].includes(normalized)) {
    return {
      label: normalized === 'rejected' ? 'Ditolak' : normalized,
      className: 'border-rose-400/25 bg-rose-500/10 text-rose-200',
      icon: XCircle,
    };
  }
  return {
    label: 'Pending',
    className: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
    icon: Clock3,
  };
}

export default function TarikSaldo() {
  const [saldo, setSaldo] = useState(0);
  const [withdraws, setWithdraws] = useState<WithdrawRecord[]>([]);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('BRI');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const apiKey = getApiKey();

  const numericAmount = Number(amount || 0);
  const fee = useMemo(() => calculateFee(numericAmount), [numericAmount]);
  const netAmount = Math.max(0, numericAmount - fee);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [meResponse, withdrawResponse] = await Promise.all([
        premiuminApi.me(apiKey || undefined),
        premiuminApi.withdraws(apiKey || undefined),
      ]);
      setSaldo(meResponse.data.saldo);
      setWithdraws(withdrawResponse.data || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat data penarikan.');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitWithdraw = async () => {
    setError('');
    setMessage('');

    if (!Number.isFinite(numericAmount) || numericAmount < MIN_WITHDRAW) {
      setError(`Minimal tarik saldo ${formatCurrency(MIN_WITHDRAW)}.`);
      return;
    }

    if (numericAmount > saldo) {
      setError('Saldo tidak cukup untuk nominal penarikan ini.');
      return;
    }

    if (!accountNumber.trim() || !accountName.trim()) {
      setError('Nomor tujuan dan nama pemilik wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      await premiuminApi.withdraw(
        {
          amount: numericAmount,
          withdraw_method: method,
          bank_account: method,
          account_number: accountNumber.trim(),
          account_name: accountName.trim(),
          notes: notes.trim(),
        },
        apiKey || undefined,
      );
      await load();
      setAmount('');
      setAccountNumber('');
      setAccountName('');
      setNotes('');
      setMessage(`Permintaan dikirim. Estimasi diterima: ${formatCurrency(netAmount)}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal mengajukan tarik saldo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 pb-6 sm:space-y-4">
      <section className="overflow-hidden rounded-[1.15rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,11,21,0.96),rgba(12,17,28,0.96))] shadow-[0_16px_34px_rgba(0,0,0,0.2)] sm:rounded-[1.35rem]">
        <div className="grid gap-4 bg-gradient-to-r from-emerald-500/12 via-brand/10 to-sky-500/10 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-white/45">Wallet</p>
            <h1 className="mt-2 text-[1.45rem] font-black leading-tight tracking-tight text-white sm:text-3xl">Tarik Saldo</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68">
              Ajukan penarikan ke rekening atau e-wallet. Tiket masuk ke admin dan saldo dipotong setelah admin menandai pembayaran selesai.
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:min-w-[320px]">
            <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Saldo</p>
              <p className="mt-1 truncate text-base font-black text-white sm:text-xl">{loading ? 'Memuat...' : formatCurrency(saldo)}</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200/70">Estimasi</p>
              <p className="mt-1 truncate text-base font-black text-emerald-100 sm:text-xl">{formatCurrency(netAmount)}</p>
            </div>
          </div>
        </div>
      </section>

      <PageSection title="Informasi biaya penarikan" subtitle="Biaya admin otomatis dihitung dari nominal yang diajukan.">
        <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
          {[
            ['Nominal 10K - 50K', formatCurrency(500)],
            ['Nominal 50K - 200K', formatCurrency(1000)],
            ['Nominal > 200K', '2%'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-3 text-left sm:rounded-[1.2rem] sm:px-5 sm:py-4 sm:text-center">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/35 sm:text-[10px]">{label}</p>
              <p className="mt-1 text-sm font-black text-white sm:mt-2">Fee: {value}</p>
            </div>
          ))}
        </div>
      </PageSection>

      {message ? (
        <div className="rounded-[1.2rem] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-[1.2rem] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <NeonCard className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
              <Banknote className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Form Penarikan</p>
              <p className="mt-1 text-xs text-white/45">Saldo tersedia: {loading ? 'Memuat...' : formatCurrency(saldo)}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <label className="grid gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/45">
              Jumlah
              <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white focus-within:border-brand/50 sm:px-4 sm:py-3">
                <CreditCard className="h-4 w-4 text-white/35" />
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
                  className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/25"
                  placeholder="Rp 0"
                  inputMode="numeric"
                />
                <button type="button" onClick={() => setAmount(String(saldo))} className="shrink-0 text-[10px] font-black uppercase tracking-[0.14em] text-brand">
                  Semua
                </button>
              </div>
            </label>

            <label className="grid gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/45">
              Metode
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value)}
                className="min-h-12 rounded-2xl border border-white/10 bg-[#0f0b15] px-3 py-2.5 text-sm text-white outline-none focus:border-brand/50 sm:px-4 sm:py-3"
              >
                {WITHDRAW_METHODS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/45">
              Nomor tujuan
              <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white focus-within:border-brand/50 sm:px-4 sm:py-3">
                <CreditCard className="h-4 w-4 text-white/35" />
                <input
                  value={accountNumber}
                  onChange={(event) => setAccountNumber(event.target.value.replace(/[^\d]/g, ''))}
                  className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/25"
                  placeholder="0812xxxx atau nomor rekening"
                  inputMode="numeric"
                />
              </div>
            </label>

            <label className="grid gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/45">
              Atas nama
              <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white focus-within:border-brand/50 sm:px-4 sm:py-3">
                <User className="h-4 w-4 text-white/35" />
                <input
                  value={accountName}
                  onChange={(event) => setAccountName(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/25"
                  placeholder="Nama pemilik rekening"
                />
              </div>
            </label>

            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-20 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-brand/50 sm:px-4 sm:py-3"
              placeholder="Catatan opsional untuk admin"
            />

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white/65 sm:col-span-2 sm:px-4 lg:col-span-1">
              <div className="flex items-center justify-between gap-3">
                <span>Biaya admin</span>
                <b className="text-white">{formatCurrency(fee)}</b>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span>Estimasi diterima</span>
                <b className="text-emerald-200">{formatCurrency(netAmount)}</b>
              </div>
            </div>

            <button
              onClick={submitWithdraw}
              disabled={submitting || loading}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-black text-white shadow-lg shadow-brand/20 disabled:opacity-60 sm:col-span-2 lg:col-span-1"
            >
              <Send className="h-4 w-4" />
              {submitting ? 'Mengajukan...' : 'Ajukan Penarikan'}
            </button>
          </div>
        </NeonCard>

        <NeonCard className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Riwayat Penarikan</p>
              <p className="mt-1 text-xs text-white/45">Tiket terbaru tampil paling atas.</p>
            </div>
            <Clock3 className="h-5 w-5 text-brand" />
          </div>

          <div className="mt-5 space-y-3 md:hidden">
            {withdraws.length ? (
              withdraws.map((row) => {
                const tone = statusTone(row.status);
                const StatusIcon = tone.icon;
                return (
                  <div key={row.id} className="rounded-[1rem] border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-white">{row.withdraw_method || row.bank_account || '-'}</p>
                        <p className="mt-1 truncate text-xs text-white/45">{row.account_number || '-'} - {row.account_name || '-'}</p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${tone.className}`}>
                        <StatusIcon className="h-3 w-3" />
                        {tone.label}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                        <p className="text-white/40">Nominal</p>
                        <p className="mt-1 font-black text-white">{formatCurrency(row.amount || 0)}</p>
                      </div>
                      <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/10 px-3 py-2">
                        <p className="text-emerald-100/55">Diterima</p>
                        <p className="mt-1 font-black text-emerald-100">{formatCurrency(row.net_amount || row.amount || 0)}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-[11px] text-white/38">{formatDate(row.created_at)}</p>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[1rem] border border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-white/45">
                Belum ada riwayat penarikan.
              </div>
            )}
          </div>

          <div className="mt-5 hidden overflow-hidden rounded-[1.2rem] border border-white/10 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-[#0f0b15] text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                  <tr>
                    <th className="px-4 py-3">Waktu</th>
                    <th className="px-4 py-3">Tujuan</th>
                    <th className="px-4 py-3">Nominal</th>
                    <th className="px-4 py-3">Diterima</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {withdraws.length ? (
                    withdraws.map((row) => {
                      const tone = statusTone(row.status);
                      const StatusIcon = tone.icon;
                      return (
                        <tr key={row.id} className="border-t border-white/10">
                          <td className="px-4 py-4 whitespace-nowrap text-white/60">{formatDate(row.created_at)}</td>
                          <td className="px-4 py-4">
                            <p className="font-bold text-white">{row.withdraw_method || row.bank_account || '-'}</p>
                            <p className="mt-1 max-w-[240px] truncate text-xs text-white/45">{row.account_number || '-'} - {row.account_name || '-'}</p>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap font-semibold text-white">{formatCurrency(row.amount || 0)}</td>
                          <td className="px-4 py-4 whitespace-nowrap font-semibold text-emerald-200">{formatCurrency(row.net_amount || row.amount || 0)}</td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${tone.className}`}>
                              <StatusIcon className="h-3 w-3" />
                              {tone.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-white/45">
                        Belum ada riwayat penarikan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </NeonCard>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {WITHDRAW_METHODS.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.value} className="flex min-h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/70 sm:px-4 sm:py-3">
              <Icon className="h-4 w-4 shrink-0 text-brand" />
              <span className="truncate">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
