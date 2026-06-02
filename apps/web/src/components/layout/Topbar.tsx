import { Menu, BadgeInfo, Bell, Megaphone } from 'lucide-react';
import { useCallback, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency } from '../../utils/format';
import { premiuminApi, type NotificationRecord } from '../../services/api';
import { getApiKey } from '../../store/useAuth';
import { useStablePolling } from '../../hooks/useStablePolling';

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

  const loadNotifications = useCallback(async () => {
    const apiKey = getApiKey();
    if (!apiKey) return;
    try {
      const response = await premiuminApi.notifications(apiKey);
      setNotifications(response.data);
      setNotificationError('');
    } catch (caught) {
      setNotificationError(caught instanceof Error ? caught.message : 'Gagal memuat notifikasi.');
    }
  }, []);

  useStablePolling(loadNotifications, 30000, { immediate: true, pauseWhenHidden: true, focusThrottleMs: 20000 });

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#09060d]/90 backdrop-blur-xl">
      <div className="flex flex-col gap-3 px-3 py-3.5 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={onMenuClick} className="rounded-2xl border border-white/10 p-2 text-white/70 lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-[18px] font-extrabold tracking-tight sm:text-[20px]">{title}</h1>
              <p className="max-w-2xl text-[11px] leading-5 text-white/45">{subtitle}</p>
            </div>
          </div>

          <div className="hidden flex-1 items-center justify-end gap-3 lg:flex">
            {saldo !== undefined ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-200">
                {formatCurrency(saldo)}
              </div>
            ) : null}
            <div className="rounded-2xl border border-brand/20 bg-brand/10 px-3 py-2 text-sm font-semibold text-white">
              {role}
            </div>
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setShowNotifications((value) => !value)}
                className={`relative inline-flex items-center justify-center rounded-2xl border px-3 py-2 transition ${
                  showNotifications
                    ? 'border-brand/30 bg-brand/15 text-white'
                    : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'
                }`}
                aria-label="Notifikasi"
              >
                <Bell className="h-4 w-4" />
                {notifications.length ? <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand" /> : null}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.96 }}
                    className="absolute right-0 mt-3 w-80 overflow-hidden rounded-3xl border border-white/10 bg-[#0d1220]/95 shadow-2xl shadow-black/40"
                  >
                    <div className="border-b border-white/10 px-4 py-3">
                      <p className="text-sm font-bold text-white">Notifikasi</p>
                      <p className="text-xs text-white/40">{notifications.length} pesan dari database</p>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notificationError ? <div className="px-4 py-4 text-sm text-rose-200">{notificationError}</div> : null}
                      {!notificationError && !notifications.length ? <div className="px-4 py-4 text-sm text-white/45">Belum ada notifikasi dari database.</div> : null}
                      {notifications.map((item) => (
                        <div key={item.id} className="flex gap-3 border-b border-white/10 px-4 py-4 last:border-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
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
