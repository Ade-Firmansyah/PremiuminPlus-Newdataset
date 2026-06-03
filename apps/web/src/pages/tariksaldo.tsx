import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Send, XCircle } from 'lucide-react';
import { PageHero, PageSection } from './dashboardPageKit';
import { formatCurrency } from '../utils/format';
import { getApiKey } from '../store/useAuth';
import { premiuminApi, type WithdrawRecord } from '../services/api';

const BANK_OPTIONS = ['BCA', 'BNI', 'BRI', 'MANDIRI', 'JAGO', 'SEABANK', 'DANA', 'OVO', 'SHOPEPAY', 'GOPAY'] as const;
const WITHDRAW_AMOUNTS = [50000, 100000, 150000, 200000, 250000, 300000, 500000, 750000, 1000000];
const MIN_WITHDRAW = 50000;
const MAX_WITHDRAW = 1000000;
const ADMIN_FEE = 0;

function statusMeta(status?: string) {
  const value = String(status || 'pending').toLowerCase();
  if (['approved', 'success', 'completed', 'selesai'].includes(value)) {
    return { label: 'Selesai', icon: CheckCircle2, tone: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' };
  }
  if (['rejected', 'failed', 'canceled', 'cancelled'].includes(value)) {
    return { label: 'Dibatalkan', icon: XCircle, tone: 'border-rose-500/25 bg-rose-500/10 text-rose-200' };
  }
  return { label: 'Pending', icon: Clock, tone: 'border-amber-500/25 bg-amber-500/10 text-amber-200' };
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return value.slice(0, 16).replace('T', ' ');
}

export default function TarikSaldo() {
  const [saldo, setSaldo] = useState(0);
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [history, setHistory] = useState<WithdrawRecord[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const apiKey = getApiKey();

  const loadAccount = useCallback(async () => {
    setLoading(true);
    try {
      const response = await premiuminApi.me(apiKey || undefined);
      setSaldo(Number(response.data.usable_balance ?? response.data.saldo ?? 0));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat saldo.');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  const loadHistory = useCallback(async () => {
    if (!apiKey) {
      setHistory([]);
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    try {
      const response = await premiuminApi.withdraws(apiKey);
      setHistory(response.data.slice(0, 10));
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    void loadAccount();
    void loadHistory();
  }, [loadAccount, loadHistory]);

  const submitWithdraw = async () => {
    const numericAmount = Number(amount);
    const normalizedBank = bankName.trim().toUpperCase();
    const normalizedAccountNumber = accountNumber.trim();
    const normalizedAccountName = accountName.trim();
    const normalizedNotes = notes.trim();
    setError('');
    setMessage('');

    if (!BANK_OPTIONS.includes(normalizedBank as (typeof BANK_OPTIONS)[number])) {
      setError('Pilih bank atau e-wallet terlebih dahulu.');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount < MIN_WITHDRAW || numericAmount > MAX_WITHDRAW) {
      setError(`Nominal penarikan minimal ${formatCurrency(MIN_WITHDRAW)} dan maksimal ${formatCurrency(MAX_WITHDRAW)}.`);
      return;
    }
    if (!WITHDRAW_AMOUNTS.includes(numericAmount)) {
      setError('Nominal penarikan wajib dipilih dari opsi tersedia.');
      return;
    }
    if (numericAmount > saldo) {
      setError('Saldo tersedia tidak cukup untuk nominal penarikan ini.');
      return;
    }
    if (!normalizedAccountNumber || !normalizedAccountName) {
      setError('Nomor rekening/akun dan nama penerima wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      await premiuminApi.withdraw(
        {
          amount: numericAmount,
          bank_account: normalizedBank,
          account_number: normalizedAccountNumber,
          account_name: normalizedAccountName,
          notes: normalizedNotes,
        },
        apiKey || undefined,
      );
      setAmount('');
      setBankName('');
      setAccountNumber('');
      setAccountName('');
      setNotes('');
      setMessage('Pengajuan withdraw dibuat. Statusnya bisa dipantau di daftar penarikan.');
      await Promise.all([loadAccount(), loadHistory()]);
      window.dispatchEvent(new Event('premiuminplus:balance-updated'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal mengajukan withdraw.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedAmount = Number(amount || 0);

  return (
    <div className="tarik-saldo space-y-4">
      <PageHero
        title="Withdraw"
        subtitle="Ajukan penarikan saldo reseller dengan data rekening yang valid."
        slogan="Minimal penarikan Rp50.000, saldo dipotong setelah admin menyelesaikan request."
        tone="from-amber-500/12 via-brand/8 to-sky-500/8"
        chips={['Minimal 50K', 'Pending review', 'Wallet safe']}
      />

      <PageSection title="Ajukan withdraw" subtitle="Form ringkas dan riwayat status penarikan.">
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Saldo tersedia</p>
                <p className="mt-2 text-2xl font-black text-white">{loading ? '...' : formatCurrency(saldo)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Minimal tarik</p>
                <p className="mt-2 text-lg font-black text-white">{formatCurrency(MIN_WITHDRAW)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Biaya admin</p>
                <p className="mt-2 text-lg font-black text-white">{formatCurrency(ADMIN_FEE)}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs leading-5 text-amber-100">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Pastikan nama dan nomor rekening benar. Jika data tidak sesuai, admin bisa membatalkan withdraw dengan catatan alasan.</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0b0a14]/95 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Bank / e-wallet</span>
                <select value={bankName} onChange={(event) => setBankName(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-brand/50">
                  <option value="" className="bg-[#0b0710]">Pilih bank/e-wallet</option>
                  {BANK_OPTIONS.map((bank) => <option key={bank} value={bank} className="bg-[#0b0710]">{bank}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Nominal</span>
                <select value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-brand/50">
                  <option value="" className="bg-[#0b0710]">Pilih nominal</option>
                  {WITHDRAW_AMOUNTS.map((item) => <option key={item} value={String(item)} className="bg-[#0b0710]">{formatCurrency(item)}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Nomor rekening / akun</span>
                <input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="Contoh: 1234567890" />
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Nama penerima</span>
                <input value={accountName} onChange={(event) => setAccountName(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="Nama sesuai rekening" />
              </label>
              <label className="block md:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Catatan tambahan</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-2 min-h-[92px] w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-brand/50" placeholder="Opsional, contoh: rekening utama / e-wallet aktif" />
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/60">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Nominal diajukan</span>
                <span className="font-black text-white">{selectedAmount ? formatCurrency(selectedAmount) : '-'}</span>
              </div>
            </div>

            {error ? <div className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div> : null}
            {message ? <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div> : null}

            <button onClick={submitWithdraw} disabled={submitting || loading} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-black text-white shadow-lg shadow-brand/20 disabled:opacity-60">
              {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Mengajukan...' : 'Ajukan Tarik Saldo'}
            </button>
          </section>
        </div>

        <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Status penarikan</p>
              <h3 className="text-base font-black text-white">Riwayat withdraw</h3>
            </div>
            <button type="button" onClick={() => void loadHistory()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/70">
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          {historyLoading ? (
            <div className="mt-4 grid gap-2">
              {[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-white/5" />)}
            </div>
          ) : history.length ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
              <div className="overflow-x-auto">
                <table className="min-w-[760px] w-full text-left text-sm">
                  <thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.16em] text-white/40">
                    <tr>
                      <th className="px-3 py-3">Invoice</th>
                      <th className="px-3 py-3">Metode</th>
                      <th className="px-3 py-3">Nominal</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Catatan admin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => {
                      const meta = statusMeta(entry.status);
                      const Icon = meta.icon;
                      return (
                        <tr key={entry.id} className="border-t border-white/10 text-white/65">
                          <td className="px-3 py-3">
                            <p className="font-black text-white">{entry.invoice || `WD-${entry.id}`}</p>
                            <p className="mt-1 text-xs text-white/38">{formatDate(entry.created_at)}</p>
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-semibold text-white/80">{entry.bank_name || entry.method || '-'}</p>
                            <p className="mt-1 text-xs text-white/42">{entry.account_number || '-'} • {entry.account_name || '-'}</p>
                          </td>
                          <td className="px-3 py-3 font-black text-white">{formatCurrency(entry.amount)}</td>
                          <td className="px-3 py-3">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${meta.tone}`}>
                              <Icon className="h-3.5 w-3.5" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-white/55">{entry.admin_note || entry.notes || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/15 px-4 py-5 text-sm text-white/45">Belum ada pengajuan withdraw.</div>
          )}
        </section>
      </PageSection>
    </div>
  );
}
