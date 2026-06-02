import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCcw, Search } from 'lucide-react';
import { PageHero, PageSection } from '../../dashboardPageKit';
import { formatCurrency } from '../../../utils/format';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type BalanceMutationRecord } from '../../../services/api';

const mutationTypes = [
  { value: '', label: 'Semua tipe' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdraw', label: 'Withdraw' },
  { value: 'refund', label: 'Refund' },
  { value: 'order_payment', label: 'Order payment' },
  { value: 'admin_adjustment', label: 'Admin adjustment' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'reseller_commission', label: 'Komisi reseller' },
];

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function badgeClass(direction: BalanceMutationRecord['direction']) {
  if (direction === 'in') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200';
  if (direction === 'out') return 'border-rose-400/20 bg-rose-400/10 text-rose-200';
  return 'border-sky-400/20 bg-sky-400/10 text-sky-200';
}

export function BalanceMutationPage({ apiKey: sessionApiKey }: { apiKey?: string } = {}) {
  const apiKey = sessionApiKey || getApiKey();
  const [rows, setRows] = useState<BalanceMutationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [type, setType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, limit: 25, total: 0, total_pages: 1 });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const params = useMemo(
    () => ({
      page,
      limit: 25,
      search: debouncedSearch,
      type,
      date_from: dateFrom,
      date_to: dateTo,
    }),
    [page, debouncedSearch, type, dateFrom, dateTo],
  );

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await premiuminApi.adminBalanceMutations(params, apiKey || undefined);
      setRows(response.data);
      setMeta(response.meta);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat mutasi saldo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [apiKey, params]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          masuk: acc.masuk + (row.saldo_masuk || 0),
          keluar: acc.keluar + (row.saldo_keluar || 0),
        }),
        { masuk: 0, keluar: 0 },
      ),
    [rows],
  );

  const exportCsv = async () => {
    setError('');
    try {
      const blob = await premiuminApi.adminBalanceMutationsCsv(params, apiKey || undefined);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'mutasi-saldo.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal export mutasi saldo.');
    }
  };

  return (
    <div className="space-y-4">
      <PageHero
        title="Mutasi Saldo"
        subtitle="Ledger saldo masuk dan keluar dengan filter, pagination, dan export CSV."
        slogan="Semua perubahan saldo lewat jalur transaksi terkunci dan tercatat."
        tone="from-emerald-500/15 via-cyan-500/10 to-fuchsia-500/10"
        chips={['Balance ledger', 'Server pagination', 'Audit finance']}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Saldo Masuk Halaman Ini</p>
          <p className="mt-2 text-2xl font-black text-emerald-200">{formatCurrency(totals.masuk)}</p>
        </div>
        <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Saldo Keluar Halaman Ini</p>
          <p className="mt-2 text-2xl font-black text-rose-200">{formatCurrency(totals.keluar)}</p>
        </div>
        <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Total Data Filter</p>
          <p className="mt-2 text-2xl font-black text-white">{meta.total}</p>
        </div>
      </section>

      <PageSection title="Finance ledger" subtitle="Mutasi saldo masuk dan keluar">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_auto_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari user, invoice, keterangan"
              className="h-12 w-full rounded-2xl border border-white/10 bg-black/20 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-brand/60"
            />
          </label>
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
            className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-brand/60"
          >
            {mutationTypes.map((item) => (
              <option key={item.value} value={item.value} className="bg-[#0f0b15]">
                {item.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
            className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-brand/60"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
            className="h-12 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-brand/60"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-bold text-white transition hover:bg-white/10"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void exportCsv()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-sm font-bold text-white shadow-lg shadow-brand/20"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

        <div className="mt-4 overflow-hidden rounded-[1.2rem] border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="bg-[#0f0b15] text-white/45">
                <tr>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Tipe Mutasi</th>
                  <th className="px-4 py-3">Saldo Masuk</th>
                  <th className="px-4 py-3">Nominal</th>
                  <th className="px-4 py-3">Saldo Keluar</th>
                  <th className="px-4 py-3">Saldo Akhir</th>
                  <th className="px-4 py-3">Sumber</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, index) => (
                      <tr key={index} className="border-t border-white/10">
                        <td colSpan={10} className="px-4 py-4">
                          <div className="h-5 animate-pulse rounded bg-white/10" />
                        </td>
                      </tr>
                    ))
                  : rows.map((row) => (
                      <tr key={row.id} className="border-t border-white/10">
                        <td className="px-4 py-4 text-white/65">{formatDateTime(row.created_at)}</td>
                        <td className="px-4 py-4">
                          <p className="font-semibold text-white">{row.username || `User #${row.user_id}`}</p>
                          <p className="mt-1 text-xs text-white/35">ID {row.user_id}</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${badgeClass(row.direction)}`}>
                            {row.mutation_type.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-emerald-200">{row.saldo_masuk ? formatCurrency(row.saldo_masuk) : '-'}</td>
                        <td className="px-4 py-4 font-semibold text-white">{formatCurrency(row.nominal || 0)}</td>
                        <td className="px-4 py-4 text-rose-200">{row.saldo_keluar ? formatCurrency(row.saldo_keluar) : '-'}</td>
                        <td className="px-4 py-4 text-white/75">{formatCurrency(row.balance_after || 0)}</td>
                        <td className="px-4 py-4 text-white/60">{[row.source_type, row.source_ref].filter(Boolean).join(' / ') || '-'}</td>
                        <td className="px-4 py-4 text-white/60">{row.admin_executor || '-'}</td>
                        <td className="px-4 py-4 text-white/60">{row.notes || '-'}</td>
                      </tr>
                    ))}
                {!loading && rows.length === 0 ? (
                  <tr className="border-t border-white/10">
                    <td colSpan={10} className="px-4 py-8 text-center text-white/45">
                      Tidak ada mutasi saldo pada filter ini.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-white/55">
          <span>
            Halaman {meta.page} dari {meta.total_pages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-semibold text-white disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= meta.total_pages || loading}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-semibold text-white disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </PageSection>
    </div>
  );
}
