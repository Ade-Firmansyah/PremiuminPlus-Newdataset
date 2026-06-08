import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Loader2, Power, RefreshCw, ShieldAlert, UploadCloud, XCircle } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, setMaintenanceMode, type RestoreJobRecord } from '../../../services/api';

const DEFAULT_MESSAGE = 'Web sedang maintenance. Mohon tidak melakukan transaksi terlebih dahulu.';

function nowLog(message: string) {
  return `[${new Date().toLocaleTimeString('id-ID', { hour12: false })}] ${message}`;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca file ZIP.'));
    reader.readAsDataURL(file);
  });
}

function ProgressBar({ value }: { value: number }) {
  const progress = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div className="h-3 overflow-hidden rounded-full border border-white/10 bg-black/30">
      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
    </div>
  );
}

function LogBox({ logs }: { logs: string[] }) {
  return (
    <div className="max-h-56 overflow-auto rounded-2xl border border-white/10 bg-black/35 p-3 font-mono text-xs leading-6 text-white/65">
      {logs.length ? logs.map((line, index) => <p key={`${line}-${index}`}>{line}</p>) : <p>Belum ada log proses.</p>}
    </div>
  );
}

type RestoreCheck = {
  label: string;
  ok: boolean;
  detail: string;
};

export function SystemBackupPage({ apiKey: sessionApiKey }: { apiKey?: string } = {}) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [backupProgress, setBackupProgress] = useState(0);
  const [restoreJob, setRestoreJob] = useState<RestoreJobRecord | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [postRestoreChecks, setPostRestoreChecks] = useState<RestoreCheck[]>([]);
  const [checkingRestore, setCheckingRestore] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const apiKey = sessionApiKey || getApiKey();

  const statusLabel = enabled ? 'Maintenance Aktif' : 'Website Normal';
  const statusTone = enabled ? 'border-amber-400/25 bg-amber-400/10 text-amber-100' : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100';
  const checklist = useMemo(() => [
    'Aktifkan maintenance',
    'Download backup ZIP',
    'Deploy backend/database/bot/frontend baru',
    'Upload backup ZIP',
    'Preview dan confirm restore',
    'Test health dan login admin',
    'Nonaktifkan maintenance di project baru',
  ], []);
  const restoreFinished = restoreJob ? ['completed', 'completed_with_warning'].includes(restoreJob.status) : false;
  const restoreStatusTone = restoreJob?.status === 'failed'
    ? 'border-rose-400/25 bg-rose-400/10 text-rose-100'
    : restoreJob?.status === 'completed_with_warning'
      ? 'border-amber-400/25 bg-amber-400/10 text-amber-100'
      : restoreFinished
        ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100'
        : 'border-sky-400/25 bg-sky-400/10 text-sky-100';

  useEffect(() => {
    let active = true;
    premiuminApi.adminMaintenance(apiKey || undefined)
      .then((response) => {
        if (!active) return;
        const nextEnabled = Boolean(response.data.enabled || response.data.maintenance);
        setEnabled(nextEnabled);
        setMaintenanceMode(nextEnabled);
        setMessage(response.data.message || DEFAULT_MESSAGE);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Gagal memuat status maintenance.');
      });
    return () => {
      active = false;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!restoreJob || !['pending', 'running'].includes(restoreJob.status)) return;
    const timer = window.setInterval(() => {
      premiuminApi.adminRestoreJobStatus(restoreJob.id, apiKey || undefined)
        .then((response) => {
          setRestoreJob(response.data);
          setLogs(response.data.logs || []);
        })
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [apiKey, restoreJob?.id, restoreJob?.status]);

  const runPostRestoreCheck = async () => {
    setCheckingRestore(true);
    setError('');
    try {
      const [summary, users, products, maintenance] = await Promise.all([
        premiuminApi.adminSummary(apiKey || undefined),
        premiuminApi.adminUsers(apiKey || undefined),
        premiuminApi.adminProducts(apiKey || undefined),
        premiuminApi.adminMaintenance(apiKey || undefined),
      ]);
      const resultChecklist = restoreJob?.result?.checklist || {};
      const checks: RestoreCheck[] = [
        {
          label: 'Admin API',
          ok: Boolean(summary.status),
          detail: 'Endpoint summary admin merespons.',
        },
        {
          label: 'Users',
          ok: Array.isArray(users.data) && users.data.length >= 1 && resultChecklist.users !== false,
          detail: `${users.data?.length || 0} user terbaca.`,
        },
        {
          label: 'Products',
          ok: Array.isArray(products.data) && resultChecklist.products !== false,
          detail: `${products.data?.length || 0} produk terbaca.`,
        },
        {
          label: 'Finance',
          ok: Number.isFinite(Number(summary.data.total_revenue)) && resultChecklist.finance !== false,
          detail: 'Summary revenue, saldo, dan mutasi dapat dihitung.',
        },
        {
          label: 'Maintenance',
          ok: maintenance.status === true,
          detail: Boolean(maintenance.data.enabled || maintenance.data.maintenance) ? 'Mode maintenance masih aktif.' : 'Mode maintenance nonaktif.',
        },
      ];
      setPostRestoreChecks(checks);
      setLogs((prev) => [nowLog('Post-restore validation completed'), ...prev]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menjalankan validasi setelah restore.');
    } finally {
      setCheckingRestore(false);
    }
  };

  useEffect(() => {
    if (!restoreFinished || postRestoreChecks.length || checkingRestore) return;
    void runPostRestoreCheck();
  }, [restoreFinished, postRestoreChecks.length, checkingRestore]);

  const saveMaintenance = async (nextEnabled: boolean) => {
    const confirmText = nextEnabled
      ? 'Aktifkan Maintenance Mode? Semua aktivitas reseller seperti deposit, order, withdraw, payment, bot, dan API transaksi akan dihentikan sementara.'
      : 'Nonaktifkan Maintenance Mode? Reseller akan dapat melakukan transaksi kembali.';
    if (!window.confirm(confirmText)) return;

    setLoading(true);
    setError('');
    setInfo('');
    try {
      const response = await premiuminApi.updateAdminMaintenance({ enabled: nextEnabled, message }, apiKey || undefined);
      const active = Boolean(response.data.enabled || response.data.maintenance);
      setEnabled(active);
      setMaintenanceMode(active);
      setInfo(response.message);
      setLogs((prev) => [nowLog(active ? 'Maintenance enabled' : 'Maintenance disabled'), ...prev]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal update maintenance.');
    } finally {
      setLoading(false);
    }
  };

  const downloadBackup = async () => {
    setLoading(true);
    setError('');
    setInfo('');
    setBackupProgress(10);
    setLogs((prev) => [nowLog('Backup started'), nowLog('Preparing database export'), ...prev]);
    try {
      setBackupProgress(35);
      const blob = await premiuminApi.adminDownloadBackup(apiKey || undefined);
      setBackupProgress(78);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `premiuminplus-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      setBackupProgress(100);
      setInfo('Backup ZIP berhasil dibuat dan diunduh.');
      setLogs((prev) => [nowLog('ZIP ready and downloaded'), ...prev]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal download backup.');
      setBackupProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const uploadBackup = async (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('File restore wajib ZIP.');
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');
    setPostRestoreChecks([]);
    setLogs((prev) => [nowLog(`Uploading ${file.name}`), nowLog('Validating backup ZIP'), ...prev]);
    try {
      const fileBase64 = await fileToBase64(file);
      const response = await premiuminApi.adminUploadRestoreZip({ file_name: file.name, file_base64: fileBase64 }, apiKey || undefined);
      setRestoreJob(response.data);
      setLogs(response.data.logs || []);
      setInfo(response.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal upload backup ZIP.');
    } finally {
      setLoading(false);
    }
  };

  const confirmRestore = async () => {
    if (!restoreJob) return;
    if (!enabled) {
      setError('Aktifkan maintenance mode sebelum mengonfirmasi restore.');
      return;
    }
    const confirmText = 'Restore akan menerapkan data backup ke database dengan upsert dan validasi checksum. Lanjutkan sekarang?';
    if (!window.confirm(confirmText)) return;

    setLoading(true);
    setError('');
    setInfo('');
    setPostRestoreChecks([]);
    try {
      const response = await premiuminApi.adminConfirmRestoreJob(restoreJob.id, apiKey || undefined);
      setRestoreJob(response.data);
      setLogs(response.data.logs || []);
      setInfo(response.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal confirm restore.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHero
        title="Maintenance & Backup"
        subtitle="Freeze transaksi, backup ZIP, restore ZIP, dan migrasi Railway/Vercel."
        slogan="Admin tetap aktif; reseller dibuat read-only agar database aman sebelum backup."
        tone="from-amber-500/15 via-sky-500/10 to-brand/10"
        chips={['Maintenance mode', 'Full ZIP backup', 'Preview restore', 'Migration ready']}
      />

      <section className="grid gap-3 md:grid-cols-3">
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Status</p>
          <p className={`mt-3 inline-flex rounded-full border px-3 py-1.5 text-sm font-black ${statusTone}`}>{statusLabel}</p>
          <p className="mt-3 text-sm text-white/45">{enabled ? 'Reseller tidak dapat transaksi.' : 'Semua aktivitas berjalan normal.'}</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Backup Format</p>
          <p className="mt-2 text-xl font-black text-white">ZIP</p>
          <p className="mt-2 text-sm text-white/45">database.sql, backup.json, metadata, info, checksums.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Restore Flow</p>
          <p className="mt-2 text-xl font-black text-sky-200">Upload → Preview → Confirm</p>
          <p className="mt-2 text-sm text-white/45">Restore tidak berjalan otomatis saat upload.</p>
        </NeonCard>
      </section>

      {info ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{info}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}

      <PageSection title="Maintenance Mode" subtitle="Freeze database mutation sebelum backup atau migrasi akun">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-28 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder={DEFAULT_MESSAGE}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => void saveMaintenance(true)} disabled={loading || enabled} className="inline-flex items-center gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm font-black text-amber-100 disabled:opacity-50">
                <ShieldAlert className="h-4 w-4" />
                Aktifkan Maintenance
              </button>
              <button onClick={() => void saveMaintenance(false)} disabled={loading || !enabled} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-100 disabled:opacity-50">
                <Power className="h-4 w-4" />
                Nonaktifkan
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/58">
            Admin tetap bisa login, backup, restore, melihat data, dan toggle OFF maintenance. Reseller hanya read-only.
          </div>
        </div>
      </PageSection>

      <PageSection title="Backup Download" subtitle="Download full backup ZIP untuk deployment baru">
        <button onClick={downloadBackup} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-black text-white disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download Full Backup ZIP
        </button>
        <div className="mt-4 space-y-2">
          <ProgressBar value={backupProgress} />
          <p className="text-xs text-white/45">{backupProgress ? `${backupProgress}%` : 'Menunggu proses backup.'}</p>
        </div>
      </PageSection>

      <PageSection title="Restore Upload" subtitle="Upload ZIP, validasi preview, lalu confirm restore">
        <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.035] px-4 py-6 text-center transition hover:border-brand/45">
          <UploadCloud className="h-7 w-7 text-brand" />
          <span className="mt-3 text-sm font-black text-white">Upload & Validate Backup ZIP</span>
          <span className="mt-1 text-xs text-white/45">Restore tidak berjalan sebelum tombol Confirm ditekan.</span>
          <input type="file" accept=".zip,application/zip" className="hidden" onChange={(event) => void uploadBackup(event.target.files?.[0] || null)} />
        </label>

        {restoreJob ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/35">Restore Job</p>
                  <p className="mt-1 break-all font-mono text-sm text-white">{restoreJob.id}</p>
                  <p className="mt-1 text-sm text-white/50">{restoreJob.message}</p>
                </div>
                <span className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] ${restoreStatusTone}`}>{restoreJob.status}</span>
              </div>
              <div className="mt-4 space-y-2">
                <ProgressBar value={restoreJob.progress} />
                <p className="text-xs text-white/45">{restoreJob.progress}%</p>
              </div>
              {restoreJob.files?.length ? (
                <p className="mt-3 text-xs text-white/45">File tervalidasi: {restoreJob.files.join(', ')}</p>
              ) : null}
              <button onClick={confirmRestore} disabled={loading || restoreJob.status !== 'pending'} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm font-black text-rose-100 disabled:opacity-50">
                Confirm Restore Sekarang
              </button>
            </div>

            {restoreJob.result?.warnings?.length ? (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                <p className="font-black">Restore selesai dengan warning</p>
                {restoreJob.result.warnings.map((warning) => (
                  <p key={warning} className="mt-1 text-amber-100/75">{warning}</p>
                ))}
              </div>
            ) : null}

            {restoreJob.result?.checklist ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {Object.entries(restoreJob.result.checklist).map(([label, ok]) => (
                  <div key={label} className={`rounded-2xl border px-4 py-3 ${ok ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-rose-500/20 bg-rose-500/10'}`}>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/35">{label}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-black text-white">
                      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-200" /> : <XCircle className="h-4 w-4 text-rose-200" />}
                      {ok ? 'OK' : 'Cek ulang'}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {restoreFinished ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/35">Validasi Setelah Restore</p>
                    <p className="mt-1 text-sm text-white/50">Cek ulang endpoint admin, users, produk, finance, dan maintenance.</p>
                  </div>
                  <button onClick={() => void runPostRestoreCheck()} disabled={checkingRestore} className="inline-flex items-center gap-2 rounded-2xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm font-black text-sky-100 disabled:opacity-50">
                    {checkingRestore ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Cek Ulang
                  </button>
                </div>
                {postRestoreChecks.length ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {postRestoreChecks.map((item) => (
                      <div key={item.label} className={`rounded-2xl border px-4 py-3 ${item.ok ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-rose-500/20 bg-rose-500/10'}`}>
                        <p className="flex items-center gap-2 text-sm font-black text-white">
                          {item.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-200" /> : <XCircle className="h-4 w-4 text-rose-200" />}
                          {item.label}
                        </p>
                        <p className="mt-1 text-xs text-white/50">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(restoreJob.preview || []).map((item) => (
                <div key={item.table} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/35">{item.table}</p>
                  <p className="mt-1 text-lg font-black text-white">{item.rows} rows</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </PageSection>

      <PageSection title="Migration Checklist" subtitle="Urutan aman pindah akun Railway/Vercel">
        <div className="grid gap-2 md:grid-cols-2">
          {checklist.map((item, index) => (
            <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/65">
              <span className="mr-2 font-black text-brand">{index + 1}.</span>{item}
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection title="Process Log" subtitle="Log proses tanpa credential, API key, atau password">
        <LogBox logs={logs} />
      </PageSection>
    </div>
  );
}
