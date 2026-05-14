import { Menu, BadgeInfo, Bell, Megaphone } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../../utils/format';
import { premiuminApi, type NotificationRecord } from '../../services/api';
import { getApiKey } from '../../store/useAuth';

// Komponen ini menjadi navbar atas untuk pencarian ringan, identitas user, dan logout cepat.
interface TopbarProps {
  title: string;
  subtitle: string;
  username: string;
  role: string;
  saldo?: number;
  onMenuClick: () => void;
}

export function Topbar({ title, subtitle, username, role, saldo, onMenuClick }: TopbarProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notificationError, setNotificationError] = useState('');
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const apiKey = getApiKey();
    if (!apiKey) return;

    let active = true;
    const loadNotifications = async () => {
      try {
        const response = await premiuminApi.notifications(apiKey);
        if (!active) return;
        setNotifications(response.data);
        setNotificationError('');
      } catch (caught) {
        if (!active) return;
        setNotificationError(caught instanceof Error ? caught.message : 'Gagal memuat notifikasi.');
      }
    };

    void loadNotifications();
    const timer = window.setInterval(loadNotifications, 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-gradient-to-r from-[#09060d]/95 via-[#0a0710]/95 to-[#09060d]/95 backdrop-blur-xl">
      <div className="flex flex-col gap-3 px-3 py-3.5 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={onMenuClick} className="rounded-2xl border border-white/10 p-2 text-white/70 transition hover:bg-white/5 lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="bg-gradient-to-r from-white via-white/95 to-white/80 bg-clip-text text-[18px] font-extrabold tracking-tight text-transparent sm:text-[20px]">{title}</h1>
              <p className="max-w-2xl text-[11px] leading-5 text-white/45">{subtitle}</p>
            </div>
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            {saldo !== undefined ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/12 to-emerald-400/5 px-3 py-2 text-sm font-semibold text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.12)]">
                {formatCurrency(saldo)}
              </div>
            ) : null}
            <div className={`rounded-2xl border px-3 py-2 text-sm font-semibold shadow-[0_0_12px_rgba(0,0,0,0.1)] transition-all ${
              role === 'admin'
                ? 'border-purple-500/30 bg-gradient-to-r from-purple-500/12 to-pink-500/8 text-purple-200 shadow-[0_0_16px_rgba(168,85,247,0.15)]'
                : 'border-brand/25 bg-gradient-to-r from-brand/12 to-pink-500/8 text-brand-light'
            }`}>
              {role}
            </div>
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setShowNotifications((value) => !value)}
                className={`relative inline-flex items-center justify-center rounded-2xl border px-3 py-2 transition ${
                  showNotifications
                    ? 'border-brand/40 bg-gradient-to-r from-brand/15 to-pink-500/8 text-white shadow-[0_0_12px_rgba(255,0,127,0.15)]'
                    : 'border-white/10 bg-white/[0.05] text-white/80 hover:bg-white/10 hover:border-white/15'
                }`}
                aria-label="Notifikasi"
              >
                <Bell className="h-4 w-4" />
                {notifications.length ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-gradient-to-r from-brand to-pink-500 shadow-[0_0_6px_rgba(255,0,127,0.6)]" /> : null}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.96 }}
                    className="absolute right-0 mt-3 w-80 overflow-hidden rounded-3xl border border-white/10 bg-[#0d1220]/95 shadow-2xl shadow-black/40 backdrop-blur"
                  >
                    <div className="border-b border-white/10 bg-gradient-to-r from-brand/5 to-transparent px-4 py-3">
                      <p className="text-sm font-bold text-white">Notifikasi</p>
                      <p className="text-xs text-white/40">{notifications.length} pesan dari database</p>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notificationError ? <div className="px-4 py-4 text-sm text-rose-200">{notificationError}</div> : null}
                      {!notificationError && !notifications.length ? <div className="px-4 py-4 text-sm text-white/45">Belum ada notifikasi dari database.</div> : null}
                      {notifications.map((item) => (
                        <div key={item.id} className="flex gap-3 border-b border-white/10 px-4 py-4 last:border-0 hover:bg-white/[0.03] transition">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand/15 to-pink-500/8 text-brand shadow-[0_0_8px_rgba(255,0,127,0.1)]">
                            <Megaphone className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-semibold text-white">{item.title}</p>
                            <p className="text-xs leading-5 text-white/45">{item.message}</p>
                            <p className="text-[10px] uppercase tracking-[0.16em] text-white/28">{item.created_at || '-'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-white/45 lg:hidden">
          <BadgeInfo className="h-4 w-4 text-brand" />
          <span>{username} sedang aktif di {role} mode</span>
        </div>
      </div>
    </header>
  );
}
