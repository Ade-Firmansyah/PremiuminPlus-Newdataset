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
  if (value.includes('dashboard') || value.includes('finance')) return 'border-violet-400/20 bg-violet-400/10 text-violet-200 shadow-violet-500/10';
  if (value.includes('komunitas')) return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200 shadow-emerald-500/10';
  if (value.includes('produk') || value.includes('product')) return 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200 shadow-fuchsia-500/10';
  if (value.includes('order')) return 'border-sky-400/20 bg-sky-400/10 text-sky-200 shadow-sky-500/10';
  if (value.includes('deposit')) return 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200 shadow-cyan-500/10';
  if (value.includes('withdraw')) return 'border-amber-400/20 bg-amber-400/10 text-amber-200 shadow-amber-500/10';
  if (value.includes('riwayat') || value.includes('transactions') || value.includes('logs')) return 'border-pink-400/20 bg-pink-400/10 text-pink-200 shadow-pink-500/10';
  if (value.includes('api')) return 'border-slate-300/20 bg-slate-300/10 text-slate-100 shadow-slate-400/10';
  if (value.includes('margin') || value.includes('pricing')) return 'border-orange-300/20 bg-orange-300/10 text-orange-200 shadow-orange-400/10';
  if (value.includes('bot')) return 'border-purple-400/20 bg-purple-400/10 text-purple-200 shadow-purple-500/10';
  if (value.includes('user')) return 'border-indigo-400/20 bg-indigo-400/10 text-indigo-200 shadow-indigo-500/10';
  if (value.includes('notification')) return 'border-rose-400/20 bg-rose-400/10 text-rose-200 shadow-rose-500/10';
  return 'border-white/10 bg-white/5 text-white/70 shadow-white/5';
}

function getActiveTone(label: string) {
  const value = label.toLowerCase();
  if (value.includes('komunitas')) return 'border-emerald-400/35 bg-emerald-400/12 shadow-emerald-500/15';
  if (value.includes('produk') || value.includes('product')) return 'border-fuchsia-400/35 bg-fuchsia-400/12 shadow-fuchsia-500/15';
  if (value.includes('order')) return 'border-sky-400/35 bg-sky-400/12 shadow-sky-500/15';
  if (value.includes('deposit')) return 'border-cyan-400/35 bg-cyan-400/12 shadow-cyan-500/15';
  if (value.includes('withdraw')) return 'border-amber-400/35 bg-amber-400/12 shadow-amber-500/15';
  if (value.includes('riwayat') || value.includes('transactions') || value.includes('logs')) return 'border-pink-400/35 bg-pink-400/12 shadow-pink-500/15';
  if (value.includes('api')) return 'border-slate-300/30 bg-slate-300/10 shadow-slate-400/10';
  if (value.includes('margin') || value.includes('pricing')) return 'border-orange-300/35 bg-orange-300/12 shadow-orange-400/15';
  if (value.includes('bot')) return 'border-purple-400/35 bg-purple-400/12 shadow-purple-500/15';
  if (value.includes('user')) return 'border-indigo-400/35 bg-indigo-400/12 shadow-indigo-500/15';
  if (value.includes('notification')) return 'border-rose-400/35 bg-rose-400/12 shadow-rose-500/15';
  return 'border-violet-400/30 bg-violet-400/10 shadow-violet-500/10';
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
        className={`fixed inset-y-0 left-0 z-50 w-[264px] border-r border-white/10 bg-[#0d0912]/95 backdrop-blur-xl transition-transform duration-300 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
            <div className="flex items-center gap-3">
              <img
                src={logoTransparent}
                alt="Premiumin Plus"
                className="h-11 w-11 rounded-2xl border border-white/10 bg-white/5 object-contain p-1"
              />
              <div>
                <p className="text-sm font-extrabold tracking-wide text-white">Premiumin Plus</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Compact panel</p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-xl p-2 text-white/50 hover:bg-white/5 lg:hidden" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="scrollbar-hidden flex-1 overflow-y-auto px-2 py-3 pb-6">
            {sections.map((section) => (
              <div key={section.label} className="mb-3 last:mb-0">
                <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[0.24em] text-white/30">{section.label}</p>
                <div className="space-y-1.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const tone = getItemTone(item.label);
                    const activeTone = getActiveTone(item.label);
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={onClose}
                      className={({ isActive }: { isActive: boolean }) =>
                          [
                            'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200 hover:translate-x-0.5',
                            isActive
                              ? `border text-white shadow-lg ring-1 ring-white/10 ${activeTone}`
                              : 'text-white/70 hover:bg-white/5 hover:text-white',
                          ].join(' ')
                        }
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border shadow-lg ring-1 ring-white/10 ${tone}`}>
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

          <div className="relative border-t border-white/10 p-2.5">
            <div className="rounded-2xl border border-brand/20 bg-[linear-gradient(145deg,rgba(255,0,127,0.10),rgba(255,255,255,0.03))] p-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-brand/25 bg-brand/15 text-sm font-black text-white shadow-[0_0_18px_rgba(255,0,127,0.14)]">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">Pengguna</p>
                  <p className="mt-1 truncate text-sm font-black text-white">{username}</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-white/45">{role}</p>
                </div>
              </div>
              {saldo !== undefined ? <p className="mt-3 text-sm font-black text-emerald-200">{formatCurrency(saldo)}</p> : null}
              <button
                onClick={onLogout}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/15"
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
