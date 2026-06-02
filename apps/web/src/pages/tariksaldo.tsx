import { useEffect, useState } from 'react';
import { AlertTriangle, Send } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from './dashboardPageKit';
import { formatCurrency, formatNumber } from '../utils/format';
import { getApiKey } from '../store/useAuth';
import { premiuminApi, type WithdrawRecord } from '../services/api';

const BANK_OPTIONS = ['BRI', 'JAGO', 'SEABANK', 'SHOPEPAY', 'GOPAY'] as const;
const WITHDRAW_AMOUNTS = [50000, 100000, 150000, 200000, 250000, 300000, 500000, 750000, 1000000];
const MIN_WITHDRAW = 50000;
const MAX_WITHDRAW = 1000000;
const WITHDRAW_WARNING = 'PERIKSA KEMBALI KAMI TIDAK TANGGUNG JAWAB JIKA SALAH NOREK KARENA SISTEM BERBASIS OTOMATIS';

export default function TarikSaldo() {
  const [saldo, setSaldo] = useState(0);
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<WithdrawRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const apiKey = getApiKey();

  useEffect(() => {
    const loadMe = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await premiuminApi.me(apiKey || undefined);
        setSaldo(response.data.saldo);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Gagal memuat saldo.');
      } finally {
        setLoading(false);
      }
    };

    void loadMe();
  }, [apiKey]);

  useEffect(() => {
    const loadHistory = async () => {
      if (!apiKey) {
        setHistory([]);
        setHistoryLoading(false);
        return;
      }

      setHistoryLoading(true);
      try {
        const response = await premiuminApi.withdraws(apiKey);
        setHistory(response.data.slice(0, 5));
      } catch {
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    };

    void loadHistory();
  }, [apiKey]);

  const submitWithdraw = async () => {
    const numericAmount = Number(amount);
    const normalizedBank = bankName.trim().toUpperCase();
    const normalizedAccountNumber = accountNumber.trim();
    const normalizedAccountName = accountName.trim();
    const normalizedNotes = notes.trim();
    setError('');
    setMessage('');

    if (!BANK_OPTIONS.includes(normalizedBank as (typeof BANK_OPTIONS)[number])) {
      setError('Nama bank wajib dipilih dari daftar resmi.');
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount < MIN_WITHDRAW || numericAmount > MAX_WITHDRAW) {
      setError(`Nominal penarikan harus antara ${formatCurrency(MIN_WITHDRAW)} sampai ${formatCurrency(MAX_WITHDRAW)}.`);
      return;
    }

    if (!WITHDRAW_AMOUNTS.includes(numericAmount)) {
      setError('Nominal penarikan wajib dipilih dari opsi yang tersedia.');
      return;
    }

    if (numericAmount > saldo) {
      setError('Saldo tidak cukup.');
      return;
    }

    if (!normalizedAccountNumber || !normalizedAccountName) {
      setError('Nomor rekening dan nama penerima wajib diisi.');
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
      const meResponse = await premiuminApi.me(apiKey || undefined);
      setSaldo(meResponse.data.saldo);
      window.dispatchEvent(new Event('premiuminplus:balance-updated'));
      setAmount('');
      setBankName('');
      setAccountNumber('');
      setAccountName('');
      setNotes('');
      const historyResponse = await premiuminApi.withdraws(apiKey || undefined);
      setHistory(historyResponse.data.slice(0, 5));
      setMessage('Pengajuan tarik saldo berhasil dibuat. Saldo belum dipotong sampai admin menyelesaikan withdraw.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal mengajukan tarik saldo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tarik-saldo">
      <PageHero
        title="Tarik Saldo"
        subtitle="Penarikan saldo dibikin sederhana, jelas, dan aman dibaca."
        slogan="Langkah singkat, data cukup, dan tampilan tetap elegan."
        tone="from-amber-500/15 via-orange-500/10 to-brand/10"
        chips={['Sederhana', 'Aman dibaca', 'Cepat diajukan']}
      />
      <div className="mt-4">
      <PageSection title="Form penarikan" subtitle="Ajukan tarik saldo dengan tampilan yang lebih ringan dan mudah dibaca.">
        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0b0a14]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-xl">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/35">Premiumin Wallet</p>
                  <h3 className="mt-3 text-3xl font-black tracking-tight text-white">Tarik saldo dengan lebih mudah</h3>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">Tampilan informasi dibuat ringkas dengan kartu khusus untuk aturan penarikan, saldo tersedia, dan biaya admin.</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 shadow-[0_15px_40px_rgba(0,0,0,0.18)]">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">Saldo tersedia</p>
                  <div className="mt-4 flex items-end gap-3">
                    <span className="text-3xl font-black text-white">Rp</span>
                    <span className="text-5xl font-black tracking-tight text-white">{loading ? '...' : formatNumber(saldo)}</span>
                  </div>
                  <p className="mt-3 text-sm text-white/50">Saldo siap digunakan untuk penarikan.</p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 text-sm text-white/75">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Minimal tarik</p>
                  <p className="mt-3 text-xl font-black text-white">{formatCurrency(MIN_WITHDRAW)}</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 text-sm text-white/75">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Maksimal tarik</p>
                  <p className="mt-3 text-xl font-black text-white">{formatCurrency(MAX_WITHDRAW)}</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 text-sm text-white/75">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/35">Biaya admin</p>
                  <p className="mt-3 text-xl font-black text-white">{formatCurrency(2500)}</p>
                </div>
              </div>

              <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/60">
                <p className="font-semibold text-white">Petunjuk singkat</p>
                <ul className="mt-3 space-y-2 list-disc pl-4 text-white/70">
                  <li>Pilih bank atau e-wallet lalu masukkan nomor akun dengan benar.</li>
                  <li>Pilih nominal penarikan sesuai batas minimal dan maksimal.</li>
                  <li>Catatan tambahan dapat membantu konfirmasi admin.</li>
                </ul>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-[#0b0a14]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/35">Riwayat Withdraw</p>
                  <h3 className="mt-2 text-xl font-black text-white">Riwayat penarikan terakhir</h3>
                </div>
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/50">5 terakhir</span>
              </div>

              {historyLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((item) => (
                    <div key={item} className="h-16 rounded-3xl bg-white/5" />
                  ))}
                </div>
              ) : history.length ? (
                <div className="space-y-3">
                  {history.map((entry) => (
                    <div key={entry.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-black text-white">{entry.invoice || `Withdraw #${entry.id}`}</p>
                          <p className="mt-1 text-sm text-white/50">{entry.created_at?.slice(0, 16).replace('T', ' ') || '-'}</p>
                          <p className="mt-1 text-xs text-white/45">{entry.bank_name || entry.method || entry.bank_account || '-'} • {entry.account_number || '-'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-white">{formatCurrency(entry.amount)}</p>
                          <p className="text-sm text-white/50">{entry.status}</p>
                        </div>
                      </div>
                      {entry.notes ? <p className="mt-3 text-sm text-white/60">Catatan: {entry.notes}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/50">Belum ada riwayat penarikan saldo.</p>
              )}
            </div>
          </div>

          <NeonCard>
            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-white/50">Bank / E-wallet</label>
                <select
                  value={bankName}
                  onChange={(event) => setBankName(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-brand/50"
                >
                  <option value="" className="bg-[#0b0710] text-white/60">Pilih bank atau e-wallet</option>
                  {BANK_OPTIONS.map((bank) => (
                    <option key={bank} value={bank} className="bg-[#0b0710] text-white">
                      {bank}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-white/50">Nomor rekening / akun</label>
                <input
                  value={accountNumber}
                  onChange={(event) => setAccountNumber(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-brand/50"
                  placeholder="Nomor rekening atau akun"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-white/50">Nama penerima</label>
                <input
                  value={accountName}
                  onChange={(event) => setAccountName(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-brand/50"
                  placeholder="Nama pemilik rekening atau e-wallet"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-white/50">Nominal penarikan</label>
                <select
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-brand/50"
                >
                  <option value="" className="bg-[#0b0710] text-white/60">Pilih nominal penarikan</option>
                  {WITHDRAW_AMOUNTS.map((item) => (
                    <option key={item} value={String(item)} className="bg-[#0b0710] text-white">
                      {formatCurrency(item)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-white/50">Catatan tambahan</label>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-brand/50"
                  placeholder="Catatan tambahan"
                />
              </div>

              {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
              {message ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}

              <button
                onClick={submitWithdraw}
                disabled={submitting || loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/20 transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Mengajukan...' : 'Ajukan Tarik Saldo'}
              </button>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs font-semibold uppercase leading-5 tracking-[0.12em] text-amber-100">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{WITHDRAW_WARNING}</span>
                </div>
              </div>
            </div>
          </NeonCard>
        </div>
      </PageSection>
      </div>
    </div>
  );
}
