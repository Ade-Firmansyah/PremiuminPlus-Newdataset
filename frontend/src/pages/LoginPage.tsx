import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Box,
  Check,
  Copy,
  Eye,
  EyeOff,
  Headphones,
  Lock,
  LogIn,
  Mail,
  MessageCircle,
  ShieldCheck,
  Star,
  User,
  Zap,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import logoUpScale from '../asset/logo-upscale.png';
import { premiuminApi } from '../services/api';
import { GradientButton, GlassCard, NeonBadge } from '../components/ui';

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.com(?:\.[a-z]{2})?$/i;
const WHATSAPP_PATTERN = /^(08\d{8,12}|628\d{8,12})$/;

type RegisterField = 'username' | 'password' | 'email' | 'phone';
type RegisterErrors = Partial<Record<RegisterField, string>>;
type ForgotField = 'username' | 'email' | 'phone';
type ForgotErrors = Partial<Record<ForgotField, string>>;

function sanitizeWhatsappInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 16);
}

function normalizeForgotWhatsappInput(value: string) {
  const digits = sanitizeWhatsappInput(value);
  if (digits.startsWith('08')) return `62${digits.slice(1)}`;
  return digits;
}

function validateRegisterFields(payload: { username: string; password: string; email: string; phone: string }) {
  const errors: RegisterErrors = {};
  const username = payload.username.trim();
  const email = payload.email.trim().toLowerCase();
  const phone = payload.phone.trim();

  if (!username) errors.username = 'Username wajib diisi.';
  else if (username.length < 4) errors.username = 'Username minimal 4 karakter.';
  else if (!/^[a-z0-9_]+$/.test(username)) errors.username = 'Username lowercase, tanpa spasi, hanya a-z, 0-9, dan _.';

  if (!payload.password) errors.password = 'Password wajib diisi.';
  else if (payload.password.length < 6) errors.password = 'Password minimal 6 karakter.';

  if (!email) errors.email = 'Email wajib diisi.';
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Email wajib memakai format example@gmail.com.';

  if (!phone) errors.phone = 'Nomor WhatsApp wajib diisi.';
  else if (!WHATSAPP_PATTERN.test(phone)) errors.phone = 'Gunakan format 08123456789 atau 628123456789.';

  return errors;
}

function validateForgotFields(payload: { username: string; email: string; phone: string }) {
  const errors: ForgotErrors = {};
  const username = payload.username.trim();
  const email = payload.email.trim().toLowerCase();
  const phone = payload.phone.trim();

  if (!username) errors.username = 'Username wajib diisi.';
  else if (!/^[a-z0-9_]{4,}$/.test(username)) errors.username = 'Username minimal 4 karakter, lowercase, tanpa spasi.';

  if (!email) errors.email = 'Email wajib diisi.';
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Gunakan format user@gmail.com.';

  if (!phone) errors.phone = 'Nomor WhatsApp wajib diisi.';
  else if (!/^628\d{8,12}$/.test(phone)) errors.phone = 'Gunakan format 628123456789.';

  return errors;
}

function FieldMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-[11px] leading-5 text-rose-200">
      {message}
    </motion.p>
  );
}

function fieldWrapClass(error?: string, valid?: boolean) {
  return [
    'pp-input flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5',
    error ? 'pp-input-error' : valid ? 'pp-input-valid' : '',
  ].join(' ');
}

interface LoginPageProps {
  onLogin: (payload: {
    username: string;
    password: string;
    remember: boolean;
  }) => Promise<{ role: 'admin' | 'reseller' | 'member' } | void>;
  initialUsername: string;
}

const featureCards = [
  { title: 'Transaksi Cepat', desc: 'Proses otomatis 24/7', icon: Zap },
  { title: 'Support 24/7', desc: 'Bantuan aktif kapan saja', icon: Headphones },
  { title: 'Produk Premium', desc: 'Katalog digital lengkap', icon: Box },
  { title: 'Aman & Terpercaya', desc: 'Akun dan transaksi terlindungi', icon: ShieldCheck },
];

export function LoginPage({ onLogin, initialUsername }: LoginPageProps) {
  const [username, setUsername] = useState(initialUsername.toLowerCase());
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [registerTouched, setRegisterTouched] = useState<Partial<Record<RegisterField, boolean>>>({});
  const [registerSubmitted, setRegisterSubmitted] = useState(false);
  const [success, setSuccess] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotPhone, setForgotPhone] = useState('');
  const [forgotTouched, setForgotTouched] = useState<Partial<Record<ForgotField, boolean>>>({});
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [adminWhatsapp, setAdminWhatsapp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setUsername(initialUsername.toLowerCase());
  }, [initialUsername]);

  useEffect(() => {
    setMode(location.pathname === '/register' ? 'register' : 'login');
  }, [location.pathname]);

  useEffect(() => {
    setError('');
    setSuccess('');
    setRegisterSubmitted(false);
    setRegisterTouched({});
  }, [mode]);

  useEffect(() => {
    let active = true;
    premiuminApi.publicConfig()
      .then((response) => {
        if (active) setAdminWhatsapp(response.data.admin_whatsapp || '');
      })
      .catch(() => {
        if (active) setAdminWhatsapp('');
      });
    return () => {
      active = false;
    };
  }, []);

  const registerErrors = validateRegisterFields({ username, password, email, phone });
  const forgotErrors = validateForgotFields({ username: forgotUsername, email: forgotEmail, phone: forgotPhone });
  const registerError = (field: RegisterField) => (registerSubmitted || registerTouched[field] || (field === 'username' && username) || (field === 'email' && email) || (field === 'phone' && phone) ? registerErrors[field] : undefined);
  const forgotErrorFor = (field: ForgotField) => (forgotSubmitted || forgotTouched[field] || (field === 'username' && forgotUsername) || (field === 'email' && forgotEmail) || (field === 'phone' && forgotPhone) ? forgotErrors[field] : undefined);
  const forgotValid = (field: ForgotField) => {
    if (field === 'username') return Boolean(forgotUsername) && !forgotErrors.username;
    if (field === 'email') return Boolean(forgotEmail) && !forgotErrors.email;
    return Boolean(forgotPhone) && !forgotErrors.phone;
  };

  const usernameReady = mode === 'register' && username.length >= 4 && !registerErrors.username;
  const formTitle = mode === 'register' ? 'Buat Akun Baru' : 'Login ke Akun Anda';
  const formSubtitle = mode === 'register' ? 'Daftar cepat untuk mulai berjualan produk digital.' : 'Masuk untuk mengakses dashboard Premiumin Plus.';
  const trustStars = useMemo(() => Array.from({ length: 5 }, (_, index) => index), []);

  const focusAuthForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const submit = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Username dan password wajib diisi.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const nextSession = await onLogin({ username: username.trim().toLowerCase(), password, remember });
      const role = nextSession && typeof nextSession === 'object' && 'role' in nextSession ? nextSession.role : 'member';
      navigate(role === 'admin' ? '/admin' : '/dashboard', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Username atau password salah.');
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async () => {
    setRegisterSubmitted(true);
    const nextErrors = validateRegisterFields({ username, password, email, phone });
    if (Object.keys(nextErrors).length) {
      setError('Periksa kembali data register yang ditandai merah.');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await premiuminApi.register({
        username: username.trim().toLowerCase(),
        password,
        email: email.trim().toLowerCase(),
        phone: sanitizeWhatsappInput(phone),
      });
      setSuccess('Pendaftaran berhasil, silakan login.');
      setMode('login');
      setPassword('');
      setEmail('');
      setPhone('');
      setRegisterSubmitted(false);
      setRegisterTouched({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Registrasi gagal.');
    } finally {
      setLoading(false);
    }
  };

  const openWhatsAppRegistration = () => {
    if (!adminWhatsapp) {
      setError('Nomor WhatsApp admin belum dikonfigurasi.');
      return;
    }
    window.open(`https://wa.me/${adminWhatsapp}?text=Masih%20ada%20slot%20join%20reseller%20%3F`, '_blank', 'noopener,noreferrer');
  };

  const submitForgotPassword = async () => {
    setForgotSubmitted(true);
    const nextErrors = validateForgotFields({ username: forgotUsername, email: forgotEmail, phone: forgotPhone });
    if (Object.keys(nextErrors).length) {
      setForgotError('Periksa kembali data yang ditandai merah.');
      return;
    }

    setForgotError('');
    setNewPassword('');
    setCopiedPassword(false);
    setLoading(true);
    try {
      const response = await premiuminApi.forgotPassword({
        username: forgotUsername.trim().toLowerCase(),
        email: forgotEmail.trim().toLowerCase(),
        phone: normalizeForgotWhatsappInput(forgotPhone),
      });
      setNewPassword(response.password);
    } catch (caught) {
      setForgotError(caught instanceof Error ? caught.message : 'Reset password gagal.');
    } finally {
      setLoading(false);
    }
  };

  const copyNewPassword = async () => {
    if (!newPassword) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      setCopiedPassword(true);
      window.setTimeout(() => setCopiedPassword(false), 1800);
    } catch {
      setForgotError('Clipboard tidak tersedia. Silakan salin password secara manual.');
    }
  };

  const closeForgotPassword = () => {
    setForgotOpen(false);
    setForgotSubmitted(false);
    setForgotTouched({});
    setForgotError('');
    setCopiedPassword(false);
    setNewPassword('');
  };

  const loginWithNewPassword = () => {
    setUsername(forgotUsername.trim().toLowerCase());
    setPassword(newPassword);
    closeForgotPassword();
  };

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-[#050816] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_49%_22%,rgba(255,46,166,.18),transparent_24rem),radial-gradient(circle_at_100%_8%,rgba(168,85,247,.16),transparent_22rem),linear-gradient(135deg,#050816_0%,#0b1020_58%,#050816_100%)]" />
      <div className="pp-grid-overlay absolute inset-0 opacity-30" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logoUpScale} alt="Premiumin Plus" className="h-11 w-11 rounded-2xl object-contain drop-shadow-[0_0_18px_rgba(255,46,136,.38)]" />
            <div>
              <p className="text-base font-black uppercase tracking-[0.2em] text-white">Premiumin</p>
              <p className="text-xs font-black uppercase tracking-[0.42em] text-brand-light">+ Plus</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              focusAuthForm();
            }}
            className="inline-flex items-center gap-2 rounded-full border border-brand/35 bg-black/20 px-4 py-2 text-xs font-black text-white shadow-[0_0_16px_rgba(255,46,136,.12)] backdrop-blur transition hover:bg-brand/10"
          >
            <LogIn className="h-4 w-4 text-brand-light" />
            Login
          </button>
        </header>

        <section className="grid flex-1 items-center gap-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] xl:gap-8">
          <div className="grid items-center gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(220px,310px)]">
            <div>
              <NeonBadge className="px-3 py-1 text-[10px]">
                <Star className="h-3.5 w-3.5" />
                #1 Platform Produk Digital Premium
              </NeonBadge>
              <h1 className="mt-4 max-w-2xl text-[2.25rem] font-black leading-[1.03] tracking-tight text-white sm:text-5xl lg:text-[3.45rem]">
                Platform Produk Digital Premium
                <span className="pp-gradient-text mt-1 block text-[1.55rem] sm:text-4xl lg:text-[2.65rem]">Cepat • Aman • Otomatis</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/68 sm:text-base">
                Marketplace produk digital untuk member dan reseller dengan dashboard cepat, transaksi aman, dan layanan bisnis yang ringan.
              </p>

              <div className="mt-5 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
                {featureCards.map((item) => {
                  const Icon = item.icon;
                  return (
                    <GlassCard key={item.title} className="rounded-2xl p-3 transition hover:-translate-y-0.5 hover:border-brand/30">
                      <div className="grid h-9 w-9 place-items-center rounded-xl border border-brand/20 bg-brand/10 text-brand-light">
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <p className="mt-2 text-xs font-black leading-4 text-white">{item.title}</p>
                      <p className="mt-1 text-[11px] leading-4 text-white/48">{item.desc}</p>
                    </GlassCard>
                  );
                })}
              </div>

              <GlassCard className="mt-5 grid gap-3 rounded-2xl p-3 sm:grid-cols-4">
                {[
                  ['50+', 'Produk Digital'],
                  ['1200+', 'Pengguna Aktif'],
                  ['99.9%', 'Uptime System'],
                  ['24/7', 'Support Aktif'],
                ].map(([value, label]) => (
                  <div key={label} className="border-white/10 sm:border-r sm:last:border-r-0">
                    <p className="text-lg font-black text-brand-light">{value}</p>
                    <p className="mt-0.5 text-[11px] text-white/52">{label}</p>
                  </div>
                ))}
              </GlassCard>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-white/58">
                <span>Dipercaya ribuan pengguna</span>
                <span className="flex items-center gap-1 text-amber-300">
                  {trustStars.map((star) => <Star key={star} className="h-3.5 w-3.5 fill-current" />)}
                  <b className="ml-1 text-white">4.9/5</b>
                </span>
              </div>
            </div>

            <div className="relative hidden min-h-[22rem] place-items-center xl:grid">
              <div className="absolute h-64 w-64 rounded-full border border-brand/20 bg-brand/10 blur-2xl" />
              <div className="pp-glass-strong pp-premium-border relative grid h-72 w-72 place-items-center rounded-[2.25rem]">
                <img src={logoUpScale} alt="Premiumin Plus" className="h-56 w-56 object-contain drop-shadow-[0_0_38px_rgba(255,46,136,.5)]" />
              </div>
            </div>
          </div>

          <section ref={formRef} className="flex items-center">
            <GlassCard className="pp-premium-border w-full rounded-[1.75rem] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-white">{formTitle}</h2>
                  <p className="mt-1 text-sm leading-5 text-white/58">{formSubtitle}</p>
                </div>
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand-light">
                  <ShieldCheck className="h-5 w-5" />
                </div>
              </div>

              <form
                className="mt-5 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (mode === 'register') void submitRegister();
                  else void submit();
                }}
              >
                <label className="block space-y-1.5">
                  <span className="text-xs font-black text-white">Username</span>
                  <motion.div animate={registerError('username') ? { x: [0, -4, 4, -3, 3, 0] } : { x: 0 }} className={fieldWrapClass(mode === 'register' ? registerError('username') : undefined, usernameReady)}>
                    <User className="h-4.5 w-4.5 text-white/48" />
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40))}
                      onBlur={() => setRegisterTouched((current) => ({ ...current, username: true }))}
                      className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/35"
                      placeholder="username"
                      autoComplete="username"
                    />
                    {usernameReady ? <Check className="h-4 w-4 text-emerald-300" /> : null}
                  </motion.div>
                  {mode === 'register' ? <FieldMessage message={registerError('username')} /> : null}
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-black text-white">Password</span>
                  <motion.div animate={mode === 'register' && registerError('password') ? { x: [0, -4, 4, -3, 3, 0] } : { x: 0 }} className={fieldWrapClass(mode === 'register' ? registerError('password') : undefined, Boolean(password) && !registerErrors.password)}>
                    <Lock className="h-4.5 w-4.5 text-white/48" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onBlur={() => setRegisterTouched((current) => ({ ...current, password: true }))}
                      className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/35"
                      placeholder="password"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="rounded-xl p-1 text-white/55 hover:text-white" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </motion.div>
                  {mode === 'register' ? <FieldMessage message={registerError('password')} /> : null}
                </label>

                {mode === 'register' ? (
                  <>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-black text-white">Email</span>
                      <motion.div animate={registerError('email') ? { x: [0, -4, 4, -3, 3, 0] } : { x: 0 }} className={fieldWrapClass(registerError('email'), Boolean(email) && !registerErrors.email)}>
                        <Mail className="h-4.5 w-4.5 text-white/48" />
                        <input
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value.replace(/\s/g, '').toLowerCase().slice(0, 120))}
                          onBlur={() => setRegisterTouched((current) => ({ ...current, email: true }))}
                          className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/35"
                          placeholder="example@gmail.com"
                        />
                      </motion.div>
                      <FieldMessage message={registerError('email')} />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-black text-white">Nomor WhatsApp</span>
                      <motion.div animate={registerError('phone') ? { x: [0, -4, 4, -3, 3, 0] } : { x: 0 }} className={fieldWrapClass(registerError('phone'), Boolean(phone) && !registerErrors.phone)}>
                        <MessageCircle className="h-4.5 w-4.5 text-brand-light" />
                        <input
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="tel"
                          value={phone}
                          onChange={(event) => setPhone(sanitizeWhatsappInput(event.target.value))}
                          onPaste={(event) => {
                            event.preventDefault();
                            setPhone(sanitizeWhatsappInput(event.clipboardData.getData('text')));
                            setRegisterTouched((current) => ({ ...current, phone: true }));
                          }}
                          onBlur={() => setRegisterTouched((current) => ({ ...current, phone: true }))}
                          className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/35"
                          placeholder="08xxxxxxxxxx"
                        />
                      </motion.div>
                      <FieldMessage message={registerError('phone')} />
                    </label>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <label className="flex items-center gap-2 text-white/60">
                      <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent accent-brand" />
                      Ingat saya
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotOpen(true);
                        setForgotUsername(username.trim().toLowerCase());
                        setForgotError('');
                        setNewPassword('');
                        setCopiedPassword(false);
                      }}
                      className="font-bold text-brand-light hover:text-white"
                    >
                      Lupa Password?
                    </button>
                  </div>
                )}

                {mode === 'register' ? (
                  <div className="rounded-2xl border border-emerald-400/18 bg-emerald-500/10 px-3.5 py-2.5 text-[11px] leading-5 text-emerald-100">
                    Dengan mendaftar, Anda menyetujui Syarat & Ketentuan Premiumin Plus.
                  </div>
                ) : null}

                {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-100">{error}</div> : null}
                {success ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-100">{success}</div> : null}

                <GradientButton type="submit" disabled={loading} className="w-full py-2.5">
                  {loading ? 'Memproses...' : mode === 'login' ? 'LOGIN' : 'Daftar Sekarang'}
                  <ArrowRight className="h-4 w-4" />
                </GradientButton>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMode((value) => (value === 'login' ? 'register' : 'login'));
                      setError('');
                    }}
                    className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-2.5 text-xs font-black text-white/78 transition hover:bg-white/10"
                  >
                    {mode === 'login' ? 'Buat akun member' : 'Sudah punya akun?'}
                  </button>
                  <button type="button" onClick={openWhatsAppRegistration} className="rounded-2xl border border-emerald-400/25 bg-emerald-500/12 px-4 py-2.5 text-xs font-black text-emerald-100 transition hover:bg-emerald-500/18">
                    Reseller via WA
                  </button>
                </div>
              </form>
            </GlassCard>
          </section>
        </section>

      </div>

      {forgotOpen ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-md">
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="pp-glass-strong w-full max-w-lg rounded-[2rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-brand-light">Reset Password</p>
                <h3 className="mt-1 text-2xl font-black text-white">Lupa Password?</h3>
                <p className="mt-2 text-sm leading-6 text-white/50">Reset hanya bisa dilakukan 1x dalam 24 jam per akun.</p>
              </div>
              <button type="button" onClick={closeForgotPassword} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/70">
                Tutup
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {(['username', 'email', 'phone'] as ForgotField[]).map((field) => {
                const Icon = field === 'username' ? User : field === 'email' ? Mail : MessageCircle;
                const value = field === 'username' ? forgotUsername : field === 'email' ? forgotEmail : forgotPhone;
                const placeholder = field === 'username' ? 'username' : field === 'email' ? 'user@gmail.com' : '628123456789';
                const label = field === 'username' ? 'Username' : field === 'email' ? 'Email' : 'Nomor WhatsApp';
                return (
                  <label key={field} className="block space-y-2">
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-white/40">{label}</span>
                    <motion.div animate={forgotErrorFor(field) || forgotError ? { x: [0, -4, 4, -3, 3, 0] } : { x: 0 }} className={fieldWrapClass(forgotErrorFor(field) || forgotError, forgotValid(field))}>
                      <Icon className="h-5 w-5 text-brand-light" />
                      <input
                        type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                        inputMode={field === 'phone' ? 'numeric' : field === 'email' ? 'email' : 'text'}
                        value={value}
                        onChange={(event) => {
                          if (field === 'username') setForgotUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40));
                          if (field === 'email') setForgotEmail(event.target.value.replace(/\s/g, '').toLowerCase().slice(0, 120));
                          if (field === 'phone') setForgotPhone(normalizeForgotWhatsappInput(event.target.value));
                        }}
                        onBlur={() => setForgotTouched((current) => ({ ...current, [field]: true }))}
                        className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/35"
                        placeholder={placeholder}
                      />
                      {forgotErrorFor(field) || forgotError ? <AlertTriangle className="h-4 w-4 text-rose-300" /> : forgotValid(field) ? <Check className="h-4 w-4 text-emerald-300" /> : null}
                    </motion.div>
                    <FieldMessage message={forgotErrorFor(field)} />
                  </label>
                );
              })}

              {forgotError ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{forgotError}</div> : null}

              {newPassword ? (
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  <p className="font-black text-white">Password baru berhasil dibuat</p>
                  <div className="mt-3 rounded-2xl border border-emerald-300/25 bg-black/20 px-4 py-3">
                    <input readOnly value={newPassword} className="w-full bg-transparent text-base font-black tracking-[0.12em] text-white outline-none" />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={copyNewPassword} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-white">
                      {copiedPassword ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copiedPassword ? 'Tersalin' : 'Salin Password'}
                    </button>
                    <button type="button" onClick={loginWithNewPassword} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white">
                      <LogIn className="h-4 w-4" />
                      Login Sekarang
                    </button>
                  </div>
                </div>
              ) : (
                <GradientButton type="button" onClick={submitForgotPassword} disabled={loading} className="w-full">
                  {loading ? 'Memproses...' : 'Generate Password Baru'}
                </GradientButton>
              )}

              <button type="button" onClick={() => adminWhatsapp && window.open(`https://wa.me/${adminWhatsapp}`, '_blank', 'noopener,noreferrer')} disabled={!adminWhatsapp} className="w-full rounded-2xl border border-emerald-400/25 bg-emerald-500/12 px-5 py-3 text-sm font-black text-emerald-100 disabled:opacity-50">
                WhatsApp Admin
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </main>
  );
}

