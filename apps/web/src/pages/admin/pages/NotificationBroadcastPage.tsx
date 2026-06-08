import { useEffect, useState } from 'react';
import { BellRing, Edit3, Pin, Save, Send, Trash2 } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type AppRole, type CommunitySettingsRecord, type NotificationRecord } from '../../../services/api';

type TargetRole = 'all' | AppRole;

const defaultCommunitySettings: CommunitySettingsRecord = {
  group_link: '',
  pinned_message: '',
  announcement: '',
  support_text: '',
};

export function NotificationBroadcastPage({ apiKey: sessionApiKey }: { apiKey?: string } = {}) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetRole, setTargetRole] = useState<TargetRole>('all');
  const [type, setType] = useState('broadcast');
  const [isPinned, setIsPinned] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [community, setCommunity] = useState<CommunitySettingsRecord>(defaultCommunitySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const apiKey = sessionApiKey || getApiKey();

  const loadNotifications = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await premiuminApi.adminNotifications(apiKey || undefined);
      setNotifications(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat notifikasi.');
    } finally {
      setLoading(false);
    }
  };

  const loadCommunity = async () => {
    try {
      const response = await premiuminApi.adminCommunitySettings(apiKey || undefined);
      setCommunity(response.data);
    } catch {
      setCommunity(defaultCommunitySettings);
    }
  };

  useEffect(() => {
    void loadNotifications();
    void loadCommunity();
  }, [apiKey]);

  const saveCommunity = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const response = await premiuminApi.updateAdminCommunitySettings(community, apiKey || undefined);
      setCommunity(response.data);
      setSuccess('Pengaturan komunitas berhasil disimpan.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan pengaturan komunitas.');
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!title.trim() || !message.trim()) {
      setError('Judul dan pesan wajib diisi.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        title: title.trim(),
        message: message.trim(),
        target_role: targetRole,
        type,
        is_active: isActive,
        is_pinned: isPinned,
      };
      if (editingId) {
        await premiuminApi.adminUpdateNotification(editingId, payload, apiKey || undefined);
      } else {
        await premiuminApi.adminCreateNotification(payload, apiKey || undefined);
      }
      setTitle('');
      setMessage('');
      setTargetRole('all');
      setType('broadcast');
      setIsPinned(false);
      setIsActive(true);
      setEditingId(null);
      setSuccess(editingId ? 'Notifikasi berhasil diperbarui.' : 'Notifikasi berhasil dikirim ke database.');
      await loadNotifications();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal mengirim notifikasi.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (item: NotificationRecord) => {
    setEditingId(item.id);
    setTitle(item.title);
    setMessage(item.message);
    setTargetRole(item.target_role);
    setType(item.type || 'broadcast');
    setIsPinned(Boolean(item.is_pinned));
    setIsActive(item.is_active !== false);
    setSuccess('');
    setError('');
  };

  const remove = async (id: number) => {
    if (!window.confirm('Hapus notifikasi ini?')) return;
    setSaving(true);
    setError('');
    try {
      await premiuminApi.adminDeleteNotification(id, apiKey || undefined);
      await loadNotifications();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menghapus notifikasi.');
    } finally {
      setSaving(false);
    }
  };

  const quickToggle = async (item: NotificationRecord, payload: Partial<NotificationRecord>) => {
    setSaving(true);
    setError('');
    try {
      await premiuminApi.adminUpdateNotification(item.id, payload, apiKey || undefined);
      await loadNotifications();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memperbarui notifikasi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHero
        title="Pesan Notifikasi"
        subtitle="Kirim pesan broadcast ke semua reseller atau admin."
        slogan="Pesan tersimpan di database dan muncul di dropdown notifikasi user."
        tone="from-brand/15 via-fuchsia-500/10 to-sky-500/10"
        chips={['Broadcast', 'Database', 'Dropdown']}
      />

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <PageSection title="Community WhatsApp" subtitle="Konten halaman komunitas">
          <div className="space-y-3">
            <input
              value={community.group_link}
              onChange={(event) => setCommunity((current) => ({ ...current, group_link: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Link grup WhatsApp"
            />
            <textarea
              value={community.announcement}
              onChange={(event) => setCommunity((current) => ({ ...current, announcement: event.target.value }))}
              className="min-h-24 w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-brand/50"
              placeholder="Announcement komunitas"
            />
            <textarea
              value={community.pinned_message}
              onChange={(event) => setCommunity((current) => ({ ...current, pinned_message: event.target.value }))}
              className="min-h-24 w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-brand/50"
              placeholder="Pinned message"
            />
            <input
              value={community.support_text}
              onChange={(event) => setCommunity((current) => ({ ...current, support_text: event.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Support text"
            />
            <button
              type="button"
              onClick={() => void saveCommunity()}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/15 px-4 py-3 text-sm font-bold text-emerald-100 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Simpan Komunitas
            </button>
          </div>
        </PageSection>

        <PageSection title="Buat notifikasi" subtitle="Broadcast pesan">
          <div className="space-y-3">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
              placeholder="Judul notifikasi"
            />
            <select
              value={targetRole}
              onChange={(event) => setTargetRole(event.target.value as TargetRole)}
              className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
            >
              <option value="all">Semua user</option>
              <option value="reseller">Reseller</option>
              <option value="admin">Admin</option>
            </select>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <input
                value={type}
                onChange={(event) => setType(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm text-white outline-none focus:border-brand/50"
                placeholder="Tipe: broadcast, order, finance"
              />
              <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm font-bold text-white/70">
                <input type="checkbox" checked={isPinned} onChange={(event) => setIsPinned(event.target.checked)} className="h-4 w-4 accent-brand" />
                Pin
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm font-bold text-white/70">
                <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="h-4 w-4 accent-brand" />
                Aktif
              </label>
            </div>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-36 w-full rounded-2xl border border-white/10 bg-[#0b0f1a] px-4 py-3 text-sm leading-6 text-white outline-none focus:border-brand/50"
              placeholder="Isi pesan notifikasi"
            />
            {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
            {success ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand/20 disabled:opacity-60"
            >
              {editingId ? <Save className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {saving ? 'Menyimpan...' : editingId ? 'Update Notifikasi' : 'Kirim Notifikasi'}
            </button>
          </div>
        </PageSection>

        <PageSection title="Riwayat notifikasi" subtitle="Pesan terbaru">
          {loading ? <p className="text-sm text-white/45">Memuat notifikasi...</p> : null}
          <div className="space-y-3">
            {notifications.map((item) => (
              <NeonCard key={item.id}>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                    <BellRing className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-white">{item.title}</p>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/55">
                        {item.target_role}
                      </span>
                      {item.is_pinned ? <span className="rounded-full border border-brand/20 bg-brand/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-brand-light">Pinned</span> : null}
                      <span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${item.is_active === false ? 'border-amber-500/20 bg-amber-500/10 text-amber-200' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'}`}>
                        {item.is_active === false ? 'Inactive' : 'Active'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-white/55">{item.message}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-white/30">{item.created_at || '-'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => edit(item)} className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/75">
                        <Edit3 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button onClick={() => void quickToggle(item, { is_pinned: !item.is_pinned })} className="inline-flex items-center gap-1 rounded-xl border border-brand/20 bg-brand/10 px-3 py-2 text-xs font-bold text-white">
                        <Pin className="h-3.5 w-3.5" /> {item.is_pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <button onClick={() => void quickToggle(item, { is_active: item.is_active === false })} className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/75">
                        {item.is_active === false ? 'Aktifkan' : 'Nonaktifkan'}
                      </button>
                      <button onClick={() => void remove(item.id)} className="inline-flex items-center gap-1 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200">
                        <Trash2 className="h-3.5 w-3.5" /> Hapus
                      </button>
                    </div>
                  </div>
                </div>
              </NeonCard>
            ))}
          </div>
          {!loading && !notifications.length ? <p className="text-sm text-white/45">Belum ada notifikasi.</p> : null}
        </PageSection>
      </div>
    </div>
  );
}
