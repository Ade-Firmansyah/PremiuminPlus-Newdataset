import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CreditCard, Send, ShieldCheck, WalletCards } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from './dashboardPageKit';
import cardArt from '../asset/logo-upscale.png';
import { formatCurrency, formatNumber } from '../utils/format';
import { getApiKey } from '../store/useAuth';
import { premiuminApi } from '../services/api';

const BANK_OPTIONS = ['BRI', 'JAGO', 'SEABANK', 'SHOPEPAY', 'GOPAY'] as const;
const WITHDRAW_AMOUNTS = [50000, 100000, 150000, 200000, 250000, 300000, 500000, 750000, 1000000];
const MIN_WITHDRAW = 50000;
const MAX_WITHDRAW = 1000000;
const ADMIN_WHATSAPP = '6283129999931';
const WITHDRAW_WARNING = 'PERIKSA KEMBALI KAMI TIDAK TANGGUNG JAWAB JIKA SALAH NOREK KARENA SISTEM BERBASIS OTOMATIS';

function buildWithdrawWhatsAppLink(bankName: string, accountNumber: string, amount: number, notes: string) {
  const text = [
    `NAMA BANK: ${bankName}`,
    `NOREK: ${accountNumber}`,
    `TOTAL: ${formatCurrency(amount)}`,
    `CATATAN: ${notes.trim() || '-'}`,
    '',
    WITHDRAW_WARNING,
  ].join('\n');

  return `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

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
    const normalizedBank = bankName.trim().toUpperCase();
    const normalizedAccountNumber = accountNumber.trim();
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

    if (!normalizedAccountNumber) {
      setError('Nomor rekening atau akun wajib diisi.');
      return;
    }

    const whatsAppLink = buildWithdrawWhatsAppLink(normalizedBank, normalizedAccountNumber, numericAmount, normalizedNotes);

    setSubmitting(true);
    try {
      await premiuminApi.withdraw(
        {
          amount: numericAmount,
          bank_account: normalizedBank,
          account_number: normalizedAccountNumber,
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
      setNotes('');
      setMessage('Pengajuan tarik saldo berhasil dibuat. WhatsApp admin dibuka untuk konfirmasi.');
      const opened = window.open(whatsAppLink, '_blank');
      if (opened) {
        opened.opener = null;
      } else {
        window.location.href = whatsAppLink;
      }
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
          <div className="overflow-hidden rounded-[1.55rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,11,21,0.98),rgba(11,9,18,0.98))] p-5 shadow-[0_0_32px_rgba(255,0,127,.07)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/35">Premiumin Wallet</p>
                <p className="mt-3 text-sm text-white/60">Saldo Tersedia</p>
                <div className="mt-1 flex items-end gap-2">
                  <span className="text-lg font-bold text-brand">Rp</span>
                  <span className="text-4xl font-black tracking-tight text-white">{loading ? '...' : formatNumber(saldo)}</span>
                </div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand/20 bg-brand/10 text-brand shadow-lg shadow-brand/10">
                <WalletCards className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-5 grid items-center gap-4 sm:grid-cols-[1fr_0.85fr]">
              <div className="space-y-3 text-sm text-white/60">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span>Minimal tarik</span>
                  <b className="text-white">{formatCurrency(MIN_WITHDRAW)}</b>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span>Maksimal tarik</span>
                  <b className="text-white">{formatCurrency(MAX_WITHDRAW)}</b>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                  <span>Biaya admin</span>
                  <b className="text-white">{formatCurrency(2500)}</b>
                </div>
              </div>
              <img
                src={cardArt}
                alt="Premiumin Wallet"
                className="mx-auto hidden h-44 w-full object-contain drop-shadow-[0_10px_26px_rgba(255,0,127,.22)] sm:block"
              />
            </div>
          </div>

          <NeonCard>
            <div className="grid gap-3">
              <select
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              >
                <option value="" className="bg-[#0b0710] text-white/60">Pilih bank atau e-wallet</option>
                {BANK_OPTIONS.map((bank) => (
                  <option key={bank} value={bank} className="bg-[#0b0710] text-white">
                    {bank}
                  </option>
                ))}
              </select>
              <input
                value={accountNumber}
                onChange={(event) => setAccountNumber(event.target.value)}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
                placeholder="Nomor rekening atau akun"
              />
              <select
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              >
                <option value="" className="bg-[#0b0710] text-white/60">Pilih nominal penarikan</option>
                {WITHDRAW_AMOUNTS.map((item) => (
                  <option key={item} value={String(item)} className="bg-[#0b0710] text-white">
                    {formatCurrency(item)}
                  </option>
                ))}
              </select>
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
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/20 disabled:opacity-60"
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

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            { label: 'Rekening aktif', icon: CreditCard },
            { label: 'Nama pemilik sesuai', icon: ShieldCheck },
            { label: 'Konfirmasi via WhatsApp', icon: CheckCircle2 },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                <Icon className="h-4 w-4 text-emerald-300" />
                {item.label}
              </div>
            );
          })}
        </div>
      </PageSection>
      </div>
    </div>
  );
}
