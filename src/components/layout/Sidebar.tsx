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
  if (value.includes('dasbor')) return 'from-brand/20 to-brand/5 text-brand';
  if (value.includes('komunitas')) return 'from-emerald-500/20 to-emerald-500/5 text-emerald-300';
  if (value.includes('order')) return 'from-sky-500/20 to-sky-500/5 text-sky-300';
  if (value.includes('deposit')) return 'from-cyan-500/20 to-cyan-500/5 text-cyan-300';
  if (value.includes('tarik')) return 'from-amber-500/20 to-amber-500/5 text-amber-300';
  if (value.includes('riwayat')) return 'from-violet-500/20 to-violet-500/5 text-violet-300';
  if (value.includes('mutasi')) return 'from-pink-500/20 to-pink-500/5 text-pink-300';
  if (value.includes('profil')) return 'from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-300';
  if (value.includes('kendala')) return 'from-rose-500/20 to-rose-500/5 text-rose-300';
  if (value.includes('bot')) return 'from-white/15 to-white/5 text-white';
  if (value.includes('dokumen')) return 'from-slate-500/20 to-slate-500/5 text-slate-200';
  return 'from-white/15 to-white/5 text-white';
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
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={onClose}
                        className={({ isActive }) =>
                          [
                            'group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-200 hover:translate-x-0.5',
                            isActive
                              ? 'bg-[linear-gradient(145deg,rgba(255,0,127,0.18),rgba(255,255,255,0.04))] text-white shadow-lg shadow-brand/20 ring-1 ring-brand/20'
                              : 'text-white/70 hover:bg-white/5 hover:text-white',
                          ].join(' ')
                        }
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 ring-white/10 ${tone}`}>
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
