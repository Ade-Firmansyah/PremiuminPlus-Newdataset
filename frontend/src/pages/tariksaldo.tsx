import { useEffect, useState } from 'react';
import { Banknote, CheckCircle2 } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from './dashboardPageKit';
import { formatCurrency } from '../utils/format';
import { getApiKey } from '../store/useAuth';
import { premiuminApi } from '../services/api';

export default function TarikSaldo() {
  const [saldo, setSaldo] = useState(0);
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
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

  const submitWithdraw = async () => {
    const numericAmount = Number(amount);
    setError('');
    setMessage('');

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Nominal penarikan tidak valid.');
      return;
    }

    if (numericAmount > saldo) {
      setError('Saldo tidak cukup.');
      return;
    }

    if (!bankName.trim() || !accountNumber.trim()) {
      setError('Bank dan nomor rekening wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      await premiuminApi.withdraw(
        {
          amount: numericAmount,
          bank_account: bankName.trim(),
          account_number: accountNumber.trim(),
          notes: notes.trim(),
        },
        apiKey || undefined,
      );
      const meResponse = await premiuminApi.me(apiKey || undefined);
      setSaldo(meResponse.data.saldo);
      window.dispatchEvent(new Event('premiuminplus:balance-updated'));
      setAmount('');
      setBankName('');
      setAccountNumber('');
      setNotes('');
      setMessage('Pengajuan tarik saldo berhasil dibuat.');
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
      <PageSection title="Form penarikan" subtitle="Penarikan saldo pengguna">
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <NeonCard>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
                <Banknote className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Saldo Tersedia</p>
                <p className="mt-1 text-2xl font-black text-white">{loading ? 'Memuat...' : formatCurrency(saldo)}</p>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm text-white/60">
              <div className="flex items-center justify-between"><span>Minimal tarik</span><b className="text-white">{formatCurrency(50000)}</b></div>
              <div className="flex items-center justify-between"><span>Biaya admin</span><b className="text-white">{formatCurrency(2500)}</b></div>
            </div>
          </NeonCard>

          <NeonCard>
            <div className="grid gap-3">
              <input
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
                placeholder="Nama bank atau e-wallet"
              />
              <input
                value={accountNumber}
                onChange={(event) => setAccountNumber(event.target.value)}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
                placeholder="Nomor rekening atau akun"
              />
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
                placeholder="Nominal penarikan"
                inputMode="numeric"
              />
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="min-h-[96px] rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
                placeholder="Catatan tambahan"
              />
              {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
              {message ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}
              <button
                onClick={submitWithdraw}
                disabled={submitting || loading}
                className="rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/20 disabled:opacity-60"
              >
                {submitting ? 'Mengajukan...' : 'Ajukan Tarik Saldo'}
              </button>
            </div>
          </NeonCard>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {['Rekening aktif', 'Nama pemilik sesuai', 'Diproses manual cepat'].map((item) => (
            <div key={item} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              {item}
            </div>
          ))}
        </div>
      </PageSection>
      </div>
    </div>
  );
}
