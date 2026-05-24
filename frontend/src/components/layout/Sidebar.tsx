import { NavLink } from 'react-router-dom';
import { LogOut, X } from 'lucide-react';
import type { NavSection } from './AppShell';
import logoTransparent from '../../asset/logo-upscale.png';
import { formatCurrency } from '../../utils/format';

// Komponen ini menampilkan menu samping dengan highlight aktif dan versi mobile drawer.
interface SidebarProps {
  open: boolean;
  sections: NavSection[];
  onClose: () => void;
  username: string;
  role: string;
  saldo?: number;
  onLogout: () => void;
}

function getItemTone(label: string) {
  const value = label.toLowerCase();
  if (value.includes('dashboard')) return {
    bg: 'from-brand/20 to-brand/5 text-brand',
    ring: 'ring-brand/30',
    shadow: 'shadow-[0_0_12px_rgba(255,0,127,0.15)]'
  };
  if (value.includes('user')) return {
    bg: 'from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-300',
    ring: 'ring-fuchsia-500/30',
    shadow: 'shadow-[0_0_12px_rgba(217,70,239,0.15)]'
  };
  if (value.includes('monitoring') || value.includes('transaksi')) return {
    bg: 'from-cyan-500/20 to-cyan-500/5 text-cyan-300',
    ring: 'ring-cyan-500/30',
    shadow: 'shadow-[0_0_12px_rgba(34,211,238,0.15)]'
  };
  if (value.includes('product')) return {
    bg: 'from-violet-500/20 to-violet-500/5 text-violet-300',
    ring: 'ring-violet-500/30',
    shadow: 'shadow-[0_0_12px_rgba(139,92,246,0.15)]'
  };
  if (value.includes('markup') || value.includes('setting')) return {
    bg: 'from-amber-500/20 to-amber-500/5 text-amber-300',
    ring: 'ring-amber-500/30',
    shadow: 'shadow-[0_0_12px_rgba(245,158,11,0.15)]'
  };
  if (value.includes('notifikasi') || value.includes('pesan')) return {
    bg: 'from-rose-500/20 to-rose-500/5 text-rose-300',
    ring: 'ring-rose-500/30',
    shadow: 'shadow-[0_0_12px_rgba(244,63,94,0.15)]'
  };
  if (value.includes('komunitas')) return {
    bg: 'from-emerald-500/20 to-emerald-500/5 text-emerald-300',
    ring: 'ring-emerald-500/30',
    shadow: 'shadow-[0_0_12px_rgba(16,185,129,0.15)]'
  };
  if (value.includes('order')) return {
    bg: 'from-sky-500/20 to-sky-500/5 text-sky-300',
    ring: 'ring-sky-500/30',
    shadow: 'shadow-[0_0_12px_rgba(14,165,233,0.15)]'
  };
  if (value.includes('deposit')) return {
    bg: 'from-cyan-500/20 to-cyan-500/5 text-cyan-300',
    ring: 'ring-cyan-500/30',
    shadow: 'shadow-[0_0_12px_rgba(34,211,238,0.15)]'
  };
  if (value.includes('tarik')) return {
    bg: 'from-amber-500/20 to-amber-500/5 text-amber-300',
    ring: 'ring-amber-500/30',
    shadow: 'shadow-[0_0_12px_rgba(245,158,11,0.15)]'
  };
  if (value.includes('riwayat')) return {
    bg: 'from-violet-500/20 to-violet-500/5 text-violet-300',
    ring: 'ring-violet-500/30',
    shadow: 'shadow-[0_0_12px_rgba(139,92,246,0.15)]'
  };
  if (value.includes('mutasi')) return {
    bg: 'from-pink-500/20 to-pink-500/5 text-pink-300',
    ring: 'ring-pink-500/30',
    shadow: 'shadow-[0_0_12px_rgba(236,72,153,0.15)]'
  };
  if (value.includes('profil')) return {
    bg: 'from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-300',
    ring: 'ring-fuchsia-500/30',
    shadow: 'shadow-[0_0_12px_rgba(217,70,239,0.15)]'
  };
  if (value.includes('kendala')) return {
    bg: 'from-rose-500/20 to-rose-500/5 text-rose-300',
    ring: 'ring-rose-500/30',
    shadow: 'shadow-[0_0_12px_rgba(244,63,94,0.15)]'
  };
  if (value.includes('bot')) return {
    bg: 'from-indigo-500/20 to-indigo-500/5 text-indigo-300',
    ring: 'ring-indigo-500/30',
    shadow: 'shadow-[0_0_12px_rgba(99,102,241,0.15)]'
  };
  if (value.includes('dokumen')) return {
    bg: 'from-slate-500/20 to-slate-500/5 text-slate-200',
    ring: 'ring-slate-500/30',
    shadow: 'shadow-[0_0_12px_rgba(100,116,139,0.15)]'
  };
  return {
    bg: 'from-white/15 to-white/5 text-white',
    ring: 'ring-white/20',
    shadow: 'shadow-[0_0_12px_rgba(255,255,255,0.1)]'
  };
}

export function Sidebar({ open, sections, onClose, username, role, saldo, onLogout }: SidebarProps) {
  const initials = username
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || username.slice(0, 2).toUpperCase() || 'US';

  return (
    <>
      {open && <button aria-label="Close sidebar" className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(280px,88vw)] border-r border-white/10 bg-[#070a13]/90 shadow-[28px_0_80px_rgba(0,0,0,.28)] backdrop-blur-2xl transition-transform duration-300 lg:w-[280px] lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_35%_0%,rgba(255,46,136,.16),transparent_18rem)]" />
        <div className="flex h-full flex-col">
          <div className="relative flex items-center justify-between border-b border-white/10 px-3 py-3.5 sm:px-4 sm:py-4">
            <div className="flex items-center gap-3">
              <img
                src={logoTransparent}
                alt="Premiumin Plus"
                className="h-12 w-12 rounded-2xl border border-brand/20 bg-brand/10 object-contain p-1 drop-shadow-[0_0_18px_rgba(255,46,136,.28)]"
              />
              <div>
                <p className="truncate text-sm font-extrabold tracking-wide text-white">Premiumin Plus</p>
                <p className="truncate text-[10px] uppercase tracking-[0.2em] text-brand-light/80">Enterprise panel</p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-xl p-2 text-white/50 hover:bg-white/5 lg:hidden" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="scrollbar-hidden relative flex-1 overflow-y-auto px-2 py-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-2.5">
            {sections.map((section) => (
              <div key={section.label} className="mb-3 last:mb-0">
                <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.24em] text-white/30">{section.label}</p>
                <div className="space-y-1.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const tone = getItemTone(item.label);
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        translate="no"
                        onClick={onClose}
                        className={({ isActive }) =>
                          [
                            'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200 hover:translate-x-0.5',
                            isActive
                              ? `bg-gradient-to-r ${tone.bg} text-white shadow-lg ${tone.shadow} ring-1 ${tone.ring}`
                              : 'text-white/70 hover:bg-white/5 hover:text-white',
                          ].join(' ')
                        }
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ${tone.bg} ${tone.shadow}`}>
                          <Icon className="h-4 w-4 shrink-0" />
                        </span>
                        <span className="leading-tight">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="relative border-t border-white/10 p-3">
            <div className={`rounded-2xl border p-3 transition-all duration-300 ${
              role === 'admin'
                ? 'border-purple-500/30 bg-gradient-to-br from-purple-500/12 to-pink-500/8 shadow-[0_0_20px_rgba(168,85,247,0.12)]'
                : 'border-brand/20 bg-gradient-to-br from-brand/10 to-pink-500/5 shadow-[0_0_20px_rgba(236,72,153,0.1)]'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl border text-sm font-black text-white transition-all ${
                  role === 'admin'
                    ? 'border-purple-500/40 bg-gradient-to-br from-purple-500/20 to-pink-500/10 shadow-[0_0_18px_rgba(168,85,247,0.18)]'
                    : 'border-brand/25 bg-gradient-to-br from-brand/20 to-pink-500/10 shadow-[0_0_18px_rgba(255,0,127,0.14)]'
                }`}>
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">Pengguna</p>
                  <p className="mt-1 truncate text-sm font-black text-white">{username}</p>
                  <p className={`mt-0.5 truncate text-[11px] font-semibold ${
                    role === 'admin' ? 'text-purple-300' : 'text-white/45'
                  }`}>{role}</p>
                </div>
              </div>
              {saldo !== undefined ? <p className="mt-3 text-sm font-black text-emerald-200">{formatCurrency(saldo)}</p> : null}
              <button
                onClick={onLogout}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-gradient-to-r from-rose-500/15 to-rose-500/5 px-3 py-2 text-sm font-semibold text-rose-200 shadow-[0_0_12px_rgba(244,63,94,0.1)] transition hover:from-rose-500/20 hover:to-rose-500/10"
              >
                <LogOut className="h-4 w-4" />
                Keluar
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
