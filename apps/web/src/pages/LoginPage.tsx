import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Eye, EyeOff, HelpCircle, Loader2, Lock, Mail, Moon, Phone, ShieldCheck, Sparkles, Sun, TrendingUp, User, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import logoUpScale from '../asset/logo-upscale.png';
import { useTheme } from '../context/ThemeContext';
import { premiuminApi, type PublicStatsRecord } from '../services/api';

interface LoginPageProps {
  onLogin: (payload: {
    username: string;
    password: string;
    remember: boolean;
  }) => Promise<{ role: 'admin' | 'reseller' } | void>;
  initialUsername: string;
  authMessage?: string;
}

type ModalMode = 'register' | 'forgot' | null;

const features = [
  { title: 'Proses Cepat', text: 'Transaksi otomatis 24 jam.', icon: Zap },
  { title: 'Aman & Terpercaya', text: 'Sistem terenkripsi dan realtime.', icon: ShieldCheck },
  { title: 'Margin Maksimal', text: 'Harga terbaik untuk reseller.', icon: TrendingUp },
  { title: 'Support 24/7', text: 'Tim support siap membantu.', icon: HelpCircle },
];

const defaultPublicStats: PublicStatsRecord = {
  registered_users: 0,
  displayed_users: 1368,
  user_base: 1368,
  user_growth_per_register: 3,
  total_transactions: 0,
  active_products: 0,
  uptime_percent: 99.9,
};

function buildLandingStats(publicStats: PublicStatsRecord) {
  return [
    { label: 'User Aktif', value: publicStats.displayed_users || defaultPublicStats.displayed_users, suffix: '+' },
    { label: 'Transaksi', value: Math.max(50000, 50000 + Number(publicStats.total_transactions || 0)), suffix: '+' },
    { label: 'Produk', value: Math.max(100, Number(publicStats.active_products || 0)), suffix: '+' },
    { label: 'Uptime', value: publicStats.uptime_percent || 99.9, suffix: '%' },
  ];
}

function AnimatedCounter({ value, suffix }: { value: number; suffix: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    const duration = 950;
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setDisplay(Number((value * (1 - Math.pow(1 - progress, 3))).toFixed(value % 1 ? 1 : 0)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{display.toLocaleString('id-ID')}{suffix}</>;
}

function Field({
  icon: Icon,
  type = 'text',
  placeholder,
  value,
  onChange,
  disabled,
  right,
}: {
  icon: typeof User;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  right?: ReactNode;
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/38" />
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-10 pr-11 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-[#ff2f92]/70 focus:bg-white/[0.08] focus:shadow-[0_0_0_4px_rgba(255,47,146,0.10)] disabled:opacity-60"
      />
      {right}
    </div>
  );
}

export function LoginPage({ onLogin, initialUsername, authMessage = '' }: LoginPageProps) {
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [status, setStatus] = useState(authMessage);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<ModalMode>(null);
  const [adminWhatsapp, setAdminWhatsapp] = useState('');
  const [publicStats, setPublicStats] = useState<PublicStatsRecord>(defaultPublicStats);
  const navigate = useNavigate();
  const landingStats = useMemo(() => buildLandingStats(publicStats), [publicStats]);

  const whatsappHref = useMemo(() => {
    const target = adminWhatsapp.replace(/\D/g, '');
    return target ? `https://wa.me/${target}?text=Halo%20Admin%20Premiumin%20Plus%2C%20saya%20butuh%20bantuan%20login.` : '';
  }, [adminWhatsapp]);

  useEffect(() => setUsername(initialUsername), [initialUsername]);
  useEffect(() => {
    if (authMessage) setStatus(authMessage);
  }, [authMessage]);
  useEffect(() => {
    let active = true;
    premiuminApi.publicConfig()
      .then((response) => {
        if (!active) return;
        setAdminWhatsapp(response.data.admin_whatsapp || '');
        if (response.data.stats) setPublicStats(response.data.stats);
      })
      .catch(() => {
        if (active) setAdminWhatsapp('');
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Username/email dan password wajib diisi.');
      return;
    }

    setError('');
    setStatus('');
    setLoading(true);

    try {
      const nextSession = await onLogin({ username: username.trim(), password, remember });
      const role = nextSession && typeof nextSession === 'object' && 'role' in nextSession ? nextSession.role : 'reseller';
      navigate(role === 'admin' ? '/admin/dashboard' : '/dashboard', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Username atau password salah.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950 dark:bg-[#050816] dark:text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,47,146,.13),transparent_28rem),radial-gradient(circle_at_82%_16%,rgba(20,184,166,.12),transparent_26rem),linear-gradient(135deg,#f8fafc_0%,#eef2ff_48%,#fff1f2_100%)] dark:bg-[radial-gradient(circle_at_18%_18%,rgba(255,47,146,.22),transparent_28rem),radial-gradient(circle_at_82%_16%,rgba(20,184,166,.18),transparent_26rem),linear-gradient(135deg,#050816_0%,#0b1020_48%,#080611_100%)]" />

      <div className="relative mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-16 lg:grid-cols-[1.08fr_0.92fr] lg:px-8 lg:py-8">
        <button
          type="button"
          onClick={toggleTheme}
          className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white/75 text-slate-700 shadow-lg shadow-slate-200/40 backdrop-blur-xl transition hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white/75 dark:shadow-black/20 dark:hover:bg-white/[0.10]"
          aria-label="Switch theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <section className="flex flex-col justify-center">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <div className="flex items-center gap-4">
              <img src={logoUpScale} alt="Premiumin Plus" className="h-16 w-16 rounded-2xl border border-white/10 bg-white/5 object-contain p-1.5 shadow-[0_0_40px_rgba(255,47,146,0.18)]" />
              <div>
                <p className="text-2xl font-black tracking-tight">Premiumin Plus</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-white/38">Digital SaaS Platform</p>
              </div>
            </div>

            <h1 className="mt-10 max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-[4rem]">
              Platform Digital Premium untuk Reseller & Pengguna Aktif
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 dark:text-white/62 sm:text-lg">
              Kelola bisnis digital lebih mudah dengan sistem otomatis, cepat, aman, dan profesional.
            </p>
          </motion.div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {features.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.08 * index }}
                className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.055]"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ff2f92]/12 text-[#ff2f92] ring-1 ring-[#ff2f92]/20">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold">{item.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-white/52">{item.text}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {landingStats.map((item) => (
              <div key={item.label} className="rounded-2xl border border-slate-200 bg-white/75 p-4 shadow-sm dark:border-white/10 dark:bg-[#0b1020]/72">
                <p className="text-2xl font-black text-[#ff2f92]"><AnimatedCounter value={item.value} suffix={item.suffix} /></p>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-white/42">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.42, delay: 0.08 }}
            className="w-full max-w-md rounded-[1.6rem] border border-slate-200 bg-white/82 p-5 shadow-2xl shadow-slate-300/35 backdrop-blur-2xl dark:border-white/10 dark:bg-[#0b1020]/78 dark:shadow-black/30 sm:p-6"
          >
            <div className="mb-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#ff2f92]/20 bg-[#ff2f92]/10 px-3 py-1.5 text-xs font-bold text-[#ff8bc5]">
                <Sparkles className="h-3.5 w-3.5" />
                Secure access
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight">Masuk Akun</h2>
              <p className="mt-1 text-sm text-white/48">Gunakan username, email, atau nomor WhatsApp Premiumin Plus.</p>
            </div>

            <AnimatePresence>
              {error ? (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {error}
                </motion.div>
              ) : null}
              {status ? (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  {status}
                </motion.div>
              ) : null}
            </AnimatePresence>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Field icon={User} placeholder="Username, email, atau nomor WhatsApp" value={username} onChange={setUsername} disabled={loading} />
              <Field
                icon={Lock}
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={setPassword}
                disabled={loading}
                right={
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/46 hover:text-white" aria-label="Toggle password">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <div className="flex items-center justify-between gap-3 text-sm">
                <label className="inline-flex items-center gap-2 text-white/58">
                  <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-white/10 accent-[#ff2f92]" />
                  Remember me
                </label>
                <button type="button" onClick={() => setModal('forgot')} className="font-semibold text-[#ff72b9] hover:text-[#ff2f92]">
                  Forgot password
                </button>
              </div>

              <button type="submit" disabled={loading} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ff2f92] text-sm font-extrabold text-white shadow-lg shadow-[#ff2f92]/22 transition hover:bg-[#e82782] disabled:cursor-not-allowed disabled:opacity-65">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                {loading ? 'Memproses login...' : 'Login'}
              </button>
            </form>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setModal('register')} className="h-11 rounded-xl border border-white/10 bg-white/[0.06] text-sm font-bold transition hover:bg-white/[0.10]">
                Register
              </button>
              <a href={whatsappHref || undefined} target="_blank" rel="noreferrer" aria-disabled={!whatsappHref} className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/15 ${whatsappHref ? '' : 'pointer-events-none opacity-50'}`}>
                <Phone className="h-4 w-4" />
                WhatsApp Help
              </a>
            </div>
          </motion.div>
        </section>
      </div>

      <AuthModal mode={modal} adminWhatsapp={adminWhatsapp} onClose={() => setModal(null)} />
    </main>
  );
}

function AuthModal({ mode, adminWhatsapp, onClose }: { mode: ModalMode; adminWhatsapp: string; onClose: () => void }) {
  const [form, setForm] = useState({ username: '', email: '', phone: '', password: '', confirmPassword: '', identifier: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (!mode) {
      setForm({ username: '', email: '', phone: '', password: '', confirmPassword: '', identifier: '' });
      setError('');
      setSuccess('');
      setNewPassword('');
    }
  }, [mode]);

  const update = (key: keyof typeof form) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setError('');
    setSuccess('');

    if (mode === 'forgot') {
      if (!form.identifier.trim()) {
        setError('Username, email, atau nomor WhatsApp wajib diisi.');
        return;
      }
    } else if (!form.username.trim() || !form.email.trim() || !form.phone.trim()) {
      setError('Username, email, dan nomor WhatsApp wajib diisi.');
      return;
    }

    if (mode === 'register' && (!form.password || form.password !== form.confirmPassword)) {
      setError('Password dan konfirmasi password harus sama.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        await premiuminApi.register({
          username: form.username.trim(),
          email: form.email.trim(),
          phone: form.phone.replace(/\D/g, ''),
          password: form.password,
          confirm_password: form.confirmPassword,
        });
        setSuccess('Registrasi berhasil. Silakan login menggunakan akun baru.');
        window.setTimeout(onClose, 900);
      } else {
        const response = await premiuminApi.forgotPassword({
          identifier: form.identifier.trim(),
        });
        setSuccess(response.message || 'Jika akun ditemukan, instruksi reset akan dikirim.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request gagal diproses.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {mode ? (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.96 }} className="w-full max-w-md rounded-[1.5rem] border border-white/10 bg-[#0b1020] p-5 text-white shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff72b9]">{mode === 'register' ? 'Register Reseller' : 'Reset Password'}</p>
                <h3 className="mt-2 text-xl font-black">{mode === 'register' ? 'Buat akun baru' : 'Lupa password'}</h3>
              </div>
              <button onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/65 hover:bg-white/5">Tutup</button>
            </div>

            <div className="mt-5 space-y-3">
              {mode === 'forgot' ? (
                <Field icon={User} placeholder="Username, email, atau nomor WhatsApp" value={form.identifier} onChange={update('identifier')} disabled={loading} />
              ) : (
                <>
                  <Field icon={User} placeholder="Username" value={form.username} onChange={update('username')} disabled={loading} />
                  <Field icon={Mail} placeholder="Email" value={form.email} onChange={update('email')} disabled={loading} />
                  <Field icon={Phone} placeholder="08123456789" value={form.phone} onChange={(value) => update('phone')(value.replace(/\D/g, ''))} disabled={loading} />
                </>
              )}
              {mode === 'register' ? (
                <>
                  <Field icon={Lock} type="password" placeholder="Password" value={form.password} onChange={update('password')} disabled={loading} />
                  <Field icon={Lock} type="password" placeholder="Confirm password" value={form.confirmPassword} onChange={update('confirmPassword')} disabled={loading} />
                </>
              ) : null}
            </div>

            {error ? <motion.div initial={{ x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</motion.div> : null}
            {success ? <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}
            {newPassword ? (
              <div className="mt-3 rounded-xl border border-[#ff2f92]/25 bg-[#ff2f92]/10 px-4 py-3">
                <p className="text-xs text-white/52">Reset password</p>
                <p className="mt-2 text-xs text-white/58">Jika ada kendala hubungi admin {adminWhatsapp || 'Premiumin Plus'}.</p>
              </div>
            ) : null}

            <button onClick={submit} disabled={loading} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#ff2f92] text-sm font-extrabold text-white shadow-lg shadow-[#ff2f92]/20 disabled:opacity-65">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === 'register' ? 'Daftar Reseller' : 'Kirim Instruksi Reset'}
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
