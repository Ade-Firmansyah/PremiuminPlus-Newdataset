import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PencilLine, Plus, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import { PageHero, PageSection, NeonCard } from '../../dashboardPageKit';
import { formatCurrency } from '../../../utils/format';
import type { AdminUser, AdminUserRole, AdminUserStatus } from '../data/types';
import { getApiKey } from '../../../store/useAuth';
import { premiuminApi, type AdminUserRecord } from '../../../services/api';

interface AdminUserDraft extends AdminUser {
  password: string;
}

const emptyUser: AdminUserDraft = {
  id: '',
  username: '',
  password: '',
  fullName: '',
  role: 'Member',
  balance: 0,
  status: 'Aktif',
  phone: '',
  email: '',
  orders: 0,
  deposits: 0,
  lastLogin: new Date().toLocaleDateString('id-ID'),
  notes: '',
};

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const WHATSAPP_PATTERN = /^(08\d{8,12}|628\d{8,12})$/;

function sanitizeWhatsappInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 16);
}

function toUiRole(role: AdminUserRecord['role']): AdminUserRole {
  if (role === 'admin') return 'Admin';
  if (role === 'reseller') return 'Reseller';
  return 'Member';
}

function toApiRole(role: AdminUserRole): AdminUserRecord['role'] {
  if (role === 'Admin') return 'admin';
  if (role === 'Reseller') return 'reseller';
  return 'member';
}

function toUiStatus(status: string): AdminUserStatus {
  if (status === 'Nonaktif' || status === 'inactive') return 'Nonaktif';
  if (status === 'Suspended' || status === 'suspended') return 'Suspended';
  return 'Aktif';
}

function toApiStatus(status: AdminUserStatus) {
  return status;
}

function normalizeUser(user: AdminUserRecord): AdminUser {
  return {
    id: String(user.id),
    username: user.username,
    fullName: user.fullName || user.username,
    role: toUiRole(user.role),
    balance: user.saldo_utama ?? user.saldo ?? 0,
    status: toUiStatus(user.status),
    phone: user.phone || '',
    email: user.email || '',
    orders: user.orders || 0,
    deposits: user.deposits || 0,
    lastLogin: user.lastLogin || new Date().toLocaleDateString('id-ID'),
    notes: user.notes || '',
  };
}

export function UserManagementPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'All' | AdminUserRole>('All');
  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<AdminUserDraft>({ ...emptyUser });
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const apiKey = getApiKey();

  const loadUsers = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await premiuminApi.adminUsers(apiKey || undefined);
      setUsers(response.data.map(normalizeUser));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal memuat data user.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, [apiKey]);

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchQuery =
        !normalized ||
        [user.username, user.fullName, user.email, user.phone].some((value) => value.toLowerCase().includes(normalized));
      const matchRole = roleFilter === 'All' || user.role === roleFilter;
      return matchQuery && matchRole;
    });
  }, [query, roleFilter, users]);

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedId) || visibleUsers[0] || users[0] || null,
    [selectedId, users, visibleUsers],
  );

  const openEditor = (user: AdminUser) => {
    setSelectedId(user.id);
    setDraft({ ...user, password: '' });
    setEditorOpen(true);
  };

  const createUser = () => {
    const next = {
      ...emptyUser,
      id: '',
      username: `user${users.length + 1}`,
      fullName: 'User Baru',
      lastLogin: new Date().toLocaleDateString('id-ID'),
    };
    setSelectedId('');
    setDraft(next);
    setEditorOpen(true);
  };

  const saveUser = async () => {
    if (!draft.username.trim()) {
      setError('Username wajib diisi.');
      return;
    }

    if (!draft.id && !draft.password.trim()) {
      setError('Password wajib diisi saat membuat user baru.');
      return;
    }

    const email = draft.email.trim().toLowerCase();
    const phone = sanitizeWhatsappInput(draft.phone);
    if (email && !EMAIL_PATTERN.test(email)) {
      setError('Email tidak valid. Gunakan format example@gmail.com.');
      return;
    }
    if (phone && !WHATSAPP_PATTERN.test(phone)) {
      setError('Nomor WhatsApp tidak valid. Gunakan format 08123456789 atau 628123456789.');
      return;
    }

    setSaving(true);
    setError('');

    const payload = {
      username: draft.username.trim(),
      fullName: draft.fullName.trim(),
      role: toApiRole(draft.role),
      email,
      phone,
      saldo: Number(draft.balance),
      status: toApiStatus(draft.status),
      orders: Number(draft.orders),
      deposits: Number(draft.deposits),
      lastLogin: draft.lastLogin,
      notes: draft.notes,
      password: draft.password.trim() || undefined,
    };

    try {
      const response = draft.id
        ? await premiuminApi.adminUpdateUser(Number(draft.id), payload, apiKey || undefined)
        : await premiuminApi.adminCreateUser(payload, apiKey || undefined);

      const nextUser = normalizeUser(response.data);
      setUsers((current) => {
        const exists = current.some((item) => item.id === nextUser.id);
        if (exists) {
          return current.map((item) => (item.id === nextUser.id ? nextUser : item));
        }
        return [nextUser, ...current];
      });
      setSelectedId(nextUser.id);
      setEditorOpen(false);
      setDraft({ ...nextUser, password: '' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gagal menyimpan user.');
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async () => {
    if (!draft.id) return;
    if (deleteInput !== draft.username) {
      setDeleteError('Username salah, masukkan kode penghapusan dengan benar.');
      return;
    }

    setSaving(true);
    setError('');
    setDeleteError('');

    try {
      await premiuminApi.adminDeleteUser(Number(draft.id), deleteInput, apiKey || undefined);
      setUsers((current) => current.filter((item) => item.id !== draft.id));
      const next = users.find((item) => item.id !== draft.id) || null;
      if (next) {
        setSelectedId(next.id);
        setDraft({ ...next, password: '' });
      } else {
        setSelectedId('');
        setDraft(emptyUser);
      }
      setEditorOpen(false);
      setDeleteOpen(false);
      setDeleteInput('');
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : 'Gagal menghapus user.');
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof AdminUserDraft>(key: K, value: AdminUserDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="space-y-4">
      <PageHero
        title="User Management"
        subtitle="Kelola user dari satu layar: tambah, edit, hapus, dan atur semua datanya dengan cepat."
        slogan="Klik satu user, lalu set seluruh profilnya tanpa berpindah-pindah halaman."
        tone="from-brand/15 via-sky-500/10 to-emerald-500/10"
        chips={['Add user', 'Edit user', 'Delete user']}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Total User</p>
          <p className="mt-2 text-2xl font-black text-white">{users.length}</p>
          <p className="mt-2 text-sm text-white/45">Semua akun yang terdaftar.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">User Aktif</p>
          <p className="mt-2 text-2xl font-black text-white">{users.filter((item) => item.status === 'Aktif').length}</p>
          <p className="mt-2 text-sm text-white/45">Akun yang bisa dipakai normal.</p>
        </NeonCard>
        <NeonCard>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">Total Saldo</p>
          <p className="mt-2 text-2xl font-black text-white">{formatCurrency(users.reduce((sum, item) => sum + item.balance, 0))}</p>
          <p className="mt-2 text-sm text-white/45">Akumulasi saldo seluruh user.</p>
        </NeonCard>
      </section>

      <div className="grid gap-4">
        <PageSection title="Daftar user" subtitle="Klik baris untuk mengatur data">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-white/35" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#0f0b15] py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-brand/60"
                placeholder="Cari username, nama, email, atau nomor"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(['All', 'Member', 'Reseller', 'Admin'] as const).map((item) => (
                <button
                  key={item}
                  onClick={() => setRoleFilter(item)}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                    roleFilter === item ? 'border-brand/20 bg-brand/10 text-white' : 'border-white/10 bg-white/5 text-white/65 hover:bg-white/10'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
          {loading ? <p className="mt-4 text-sm text-white/45">Memuat data user...</p> : null}

          <div className="mt-4 overflow-hidden rounded-[1.2rem] border border-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="bg-[#0f0b15] text-white/45">
                  <tr>
                    <th className="px-4 py-3">Username</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Saldo</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => openEditor(row)}
                      className={`cursor-pointer border-t border-white/10 transition hover:bg-white/5 ${selectedId === row.id ? 'bg-white/5' : ''}`}
                    >
                      <td className="px-4 py-4">
                        <p className="font-semibold text-white">{row.username}</p>
                        <p className="mt-1 text-xs text-white/40">{row.fullName}</p>
                      </td>
                      <td className="px-4 py-4 text-white/70">{row.role}</td>
                      <td className="px-4 py-4 text-white">{formatCurrency(row.balance)}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white">
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditor(row);
                            }}
                            className="inline-flex items-center gap-1 rounded-2xl border border-brand/20 bg-brand/10 px-3 py-2 text-xs font-semibold text-white"
                          >
                            <PencilLine className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={createUser}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/20"
            >
              <Plus className="h-4 w-4" />
              Tambah User
            </button>
            <button
              onClick={() => selectedUser && openEditor(selectedUser)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 hover:bg-white/10"
            >
              <PencilLine className="h-4 w-4" />
              Edit User
            </button>
          </div>

          <div className="mt-4 rounded-[1.15rem] border border-brand/20 bg-[linear-gradient(145deg,rgba(255,0,127,0.08),rgba(255,255,255,0.02))] p-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <div>
                <p className="text-sm font-semibold text-white">Quick preview</p>
                <p className="text-xs text-white/45">Klik baris user lain untuk langsung edit semua data.</p>
              </div>
            </div>
            {selectedUser ? (
              <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-[#0f0b15] p-4 md:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">User aktif</p>
                  <p className="mt-2 text-lg font-black text-white">{selectedUser.username}</p>
                  <p className="mt-1 text-sm text-white/55">{selectedUser.fullName}</p>
                </div>
                <div className="space-y-1 text-sm text-white/55">
                  <div className="flex items-center justify-between gap-3">
                    <span>Saldo</span>
                    <b className="text-white">{formatCurrency(selectedUser.balance)}</b>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Orders</span>
                    <b className="text-white">{selectedUser.orders}</b>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Deposits</span>
                    <b className="text-white">{selectedUser.deposits}</b>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </PageSection>
      </div>

      <AnimatePresence>
        {editorOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8"
            onClick={() => setEditorOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.18 }}
              className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[1.5rem] border border-white/10 bg-[#0b0f1a] p-5 shadow-2xl shadow-black/40"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">User Editor</p>
                  <h3 className="mt-1 text-xl font-extrabold text-white">{draft.id ? 'Edit User' : 'Tambah User'}</h3>
                </div>
                <button onClick={() => setEditorOpen(false)} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                  Tutup
                </button>
              </div>

              <form className="mt-4 grid gap-3" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Username</span>
                    <input
                      name="admin-username"
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={draft.username}
                      onChange={(e) => setField('username', e.target.value)}
                      className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0f0b15] px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Password</span>
                    <input
                      type="password"
                      name="admin-new-password"
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={draft.password}
                      onChange={(e) => setField('password', e.target.value)}
                      placeholder={draft.id ? 'Kosongkan jika tidak diubah' : 'Wajib diisi untuk user baru'}
                      className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0f0b15] px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Nama lengkap</span>
                    <input
                      value={draft.fullName}
                      onChange={(e) => setField('fullName', e.target.value)}
                      className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0f0b15] px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Role</span>
                    <select
                      value={draft.role}
                      onChange={(e) => setField('role', e.target.value as AdminUserRole)}
                      className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0f0b15] px-4 py-3 text-sm text-white outline-none"
                    >
                      <option>Member</option>
                      <option>Reseller</option>
                      <option>Admin</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Status</span>
                    <select
                      value={draft.status}
                      onChange={(e) => setField('status', e.target.value as AdminUserStatus)}
                      className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0f0b15] px-4 py-3 text-sm text-white outline-none"
                    >
                      <option>Aktif</option>
                      <option>Nonaktif</option>
                      <option>Suspended</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Saldo</span>
                    <input
                      type="number"
                      value={draft.balance}
                      onChange={(e) => setField('balance', Number(e.target.value))}
                      className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0f0b15] px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Nomor WA</span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={draft.phone}
                      onChange={(e) => setField('phone', sanitizeWhatsappInput(e.target.value))}
                      onPaste={(event) => {
                        event.preventDefault();
                        setField('phone', sanitizeWhatsappInput(event.clipboardData.getData('text')));
                      }}
                      className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0f0b15] px-4 py-3 text-sm text-white outline-none"
                      placeholder="08123456789"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Email</span>
                    <input
                      type="email"
                      inputMode="email"
                      value={draft.email}
                      onChange={(e) => setField('email', e.target.value.replace(/\s/g, '').slice(0, 120))}
                      className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0f0b15] px-4 py-3 text-sm text-white outline-none"
                      placeholder="example@gmail.com"
                    />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Orders</span>
                    <input
                      type="number"
                      value={draft.orders}
                      onChange={(e) => setField('orders', Number(e.target.value))}
                      className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0f0b15] px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Deposits</span>
                    <input
                      type="number"
                      value={draft.deposits}
                      onChange={(e) => setField('deposits', Number(e.target.value))}
                      className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0f0b15] px-4 py-3 text-sm text-white outline-none"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Last Login</span>
                  <input
                    value={draft.lastLogin}
                    onChange={(e) => setField('lastLogin', e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-white/10 bg-[#0f0b15] px-4 py-3 text-sm text-white outline-none"
                  />
                </label>

                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Catatan</span>
                  <textarea
                    value={draft.notes}
                    onChange={(e) => setField('notes', e.target.value)}
                    className="mt-1.5 min-h-28 w-full rounded-2xl border border-white/10 bg-[#0f0b15] px-4 py-3 text-sm leading-6 text-white outline-none"
                  />
                </label>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={saveUser}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/20 disabled:opacity-60"
                  >
                    <PencilLine className="h-4 w-4" />
                    {saving ? 'Menyimpan...' : 'Save Update'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteInput('');
                      setDeleteError('');
                      setDeleteOpen(true);
                    }}
                    disabled={saving || !draft.id}
                    className="inline-flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 hover:bg-rose-500/15 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Hapus User
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] grid place-items-center bg-black/75 px-4 py-8 backdrop-blur-sm"
            onClick={() => setDeleteOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="w-full max-w-md rounded-[1.4rem] border border-rose-500/25 bg-[#0b0f1a] p-5 shadow-[0_0_40px_rgba(244,63,94,0.16)]"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-rose-300">Konfirmasi Hapus User</p>
              <h3 className="mt-2 text-xl font-black text-white">Ketik username user untuk menghapus akun ini.</h3>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Target User</p>
                <p className="mt-1 text-lg font-black text-white">{draft.username}</p>
              </div>
              <input
                value={deleteInput}
                onChange={(event) => {
                  setDeleteInput(event.target.value);
                  setDeleteError('');
                }}
                className={`mt-4 w-full rounded-2xl border px-4 py-3 text-sm text-white outline-none transition ${
                  deleteInput && deleteInput !== draft.username
                    ? 'border-rose-500/50 bg-rose-500/10 animate-pulse'
                    : 'border-white/10 bg-[#0f0b15] focus:border-brand/60'
                }`}
                placeholder="Ketik username persis"
                autoFocus
              />
              {(deleteInput && deleteInput !== draft.username) || deleteError ? (
                <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {deleteError || 'Username salah, masukkan kode penghapusan dengan benar.'}
                </div>
              ) : null}
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setDeleteOpen(false)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/75"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={removeUser}
                  disabled={saving || deleteInput !== draft.username}
                  className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-rose-600/20 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {saving ? 'Menghapus...' : 'Hapus User'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
