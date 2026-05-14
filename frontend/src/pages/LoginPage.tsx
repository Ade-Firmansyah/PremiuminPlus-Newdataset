import { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, MessageCircle, Sparkles, User } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import logoUpScale from '../asset/logo-upscale.png';
import { premiuminApi } from '../services/api';

// Halaman login ini dibuat ringkas, elegan, dan bebas scroll berlebih.
interface LoginPageProps {
  onLogin: (payload: {
    username: string;
    password: string;
    remember: boolean;
  }) => Promise<{ role: 'admin' | 'reseller' | 'member' } | void>;
  initialUsername: string;
}

export function LoginPage({ onLogin, initialUsername }: LoginPageProps) {
  const [username, setUsername] = useState(initialUsername);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [success, setSuccess] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotPhone, setForgotPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [adminWhatsapp, setAdminWhatsapp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setUsername(initialUsername);
  }, [initialUsername]);

  useEffect(() => {
    setMode(location.pathname === '/register' ? 'register' : 'login');
  }, [location.pathname]);

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

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const submit = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Username dan password wajib diisi.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const nextSession = await onLogin({ username: username.trim(), password, remember });
      const role = nextSession && typeof nextSession === 'object' && 'role' in nextSession ? nextSession.role : 'member';
      navigate(role === 'admin' ? '/admin' : '/dashboard', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Username atau password salah.');
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Username dan password wajib diisi.');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await premiuminApi.register({
        username: username.trim(),
        password,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setSuccess('Pendaftaran berhasil, silakan login.');
      setMode('login');
      setPassword('');
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
    window.open(
      `https://wa.me/${adminWhatsapp}?text=Masih%20ada%20slot%20join%20reseller%20%3F`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const submitForgotPassword = async () => {
    setError('');
    setSuccess('');
    setNewPassword('');
    setLoading(true);
    try {
      const response = await premiuminApi.forgotPassword({
        username: forgotUsername.trim(),
        email: forgotEmail.trim(),
        phone: forgotPhone.trim(),
      });
      setNewPassword(response.password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reset password gagal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="relative h-[100svh] overflow-hidden bg-[#090a13] px-3 py-3 text-white sm:px-4 sm:py-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_35%,rgba(255,0,127,0.24),transparent_28%),radial-gradient(circle_at_85%_18%,rgba(255,117,186,0.16),transparent_26%),linear-gradient(135deg,#0b1020_0%,#090812_42%,#150613_100%)]" />
      <div className="pointer-events-none absolute left-0 top-0 h-72 w-72 opacity-20 [background-image:linear-gradient(30deg,rgba(255,255,255,.12)_12%,transparent_12.5%,transparent_87%,rgba(255,255,255,.12)_87.5%,rgba(255,255,255,.12)),linear-gradient(150deg,rgba(255,255,255,.12)_12%,transparent_12.5%,transparent_87%,rgba(255,255,255,.12)_87.5%,rgba(255,255,255,.12)),linear-gradient(30deg,rgba(255,255,255,.12)_12%,transparent_12.5%,transparent_87%,rgba(255,255,255,.12)_87.5%,rgba(255,255,255,.12)),linear-gradient(150deg,rgba(255,255,255,.12)_12%,transparent_12.5%,transparent_87%,rgba(255,255,255,.12)_87.5%,rgba(255,255,255,.12))] [background-size:80px_140px] [background-position:0_0,0_0,40px_70px,40px_70px]" />
      <div className="pointer-events-none absolute bottom-[-18rem] left-[-10rem] h-[36rem] w-[54rem] rotate-[-18deg] rounded-[50%] border-t-4 border-brand/70 bg-brand/10 blur-[1px]" />
      <div className="pointer-events-none absolute bottom-[-19rem] left-[-8rem] h-[32rem] w-[50rem] rotate-[-18deg] rounded-[50%] border-t border-brand/45" />
      <div className="pointer-events-none absolute right-0 top-24 h-96 w-52 opacity-35 [background-image:radial-gradient(circle,rgba(255,0,127,.65)_1.5px,transparent_1.6px)] [background-size:18px_18px]" />

      <div className="relative mx-auto grid h-full max-w-5xl items-center gap-6 lg:grid-cols-[1fr_0.92fr]">
        <motion.section
          className="hidden min-h-0 flex-col justify-center px-2 lg:flex"
          initial={{ x: -24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.45 }}
        >
          <div className="relative mx-auto flex h-60 w-60 items-center justify-center sm:h-64 sm:w-64">
            <div className="absolute inset-0 rounded-[2rem] bg-brand/15 blur-2xl" />
            <div className="absolute inset-3 rounded-[1.75rem] border border-white/10 bg-white/5 backdrop-blur-xl" />
            <img
              src={logoUpScale}
              alt="Premiumin Plus"
              className="relative z-10 h-auto w-full max-w-[260px] rounded-[1.25rem] object-contain opacity-95 drop-shadow-[0_18px_32px_rgba(0,0,0,.35)]"
            />
            <Sparkles className="absolute right-2 top-6 h-8 w-8 text-brand drop-shadow-[0_0_16px_rgba(255,0,127,.75)]" />
            <Sparkles className="absolute bottom-4 left-5 h-5 w-5 text-brand-light" />
          </div>

          <div className="mt-4 text-center">
            <h1 className="text-4xl font-black uppercase tracking-[0.18em] text-white drop-shadow-[0_8px_20px_rgba(255,255,255,.18)]">
              Premiumin
            </h1>
            <div className="mt-2 flex items-center justify-center gap-3">
              <span className="h-1 w-14 rounded-full bg-brand" />
              <p className="text-2xl font-black uppercase tracking-[0.45em] text-brand">Plus</p>
              <span className="h-1 w-14 rounded-full bg-brand" />
            </div>
            <p className="mx-auto mt-3 max-w-xl text-base font-semibold text-white/90">
              Solusi produk digital premium untuk reseller dan pengguna aktif
            </p>
            <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-white/50">
              Dashboard cepat untuk akun premium, deposit saldo, transaksi sukses, dan layanan digital yang elegan.
            </p>
          </div>

          <div className="mx-auto mt-5 grid w-full max-w-lg grid-cols-2 gap-2 text-xs">
            <div className="rounded-2xl border border-brand/20 bg-black/20 p-3 backdrop-blur">
              <p className="text-white/35">Produk Digital</p>
              <p className="mt-1 text-base font-bold">Lebih dari 50 Produk</p>
            </div>
            <div className="rounded-2xl border border-brand/20 bg-black/20 p-3 backdrop-blur">
              <p className="text-white/35">Pengguna</p>
              <p className="mt-1 text-base font-bold">Lebih dari 1200</p>
            </div>
            <div className="rounded-2xl border border-brand/20 bg-black/20 p-3 backdrop-blur">
              <p className="text-white/35">Cepat</p>
              <p className="mt-1 text-base font-bold">Transaksi Sukses</p>
            </div>
            <div className="rounded-2xl border border-brand/20 bg-black/20 p-3 backdrop-blur">
              <p className="text-white/35">UI Ringan</p>
              <p className="mt-1 text-base font-bold">Fleksibilitas</p>
            </div>
          </div>
        </motion.section>

        <motion.section
          className="mx-auto w-full max-w-md rounded-[1.4rem] border border-brand/35 bg-[#0d1220]/72 p-5 shadow-[0_0_36px_rgba(0,0,0,.38)] backdrop-blur-xl sm:p-5 lg:p-5"
          initial={{ x: 24, opacity: 0, scale: 0.98 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, delay: 0.05 }}
        >
          <div className="text-center">
            <p className="text-base font-extrabold tracking-tight text-white sm:text-lg">Selamat Datang di</p>
            <h2 className="mt-1.5 bg-gradient-to-r from-brand-light via-brand to-brand bg-clip-text text-[1.7rem] font-black tracking-tight text-transparent sm:text-3xl">
              Premiumin Plus
            </h2>
            <p className="mt-2 text-xs text-white/75 sm:text-sm">Masuk untuk mengakses dashboard Anda</p>
            <div className="mx-auto mt-3 flex max-w-md items-center gap-3 text-brand">
              <span className="h-px flex-1 bg-brand/40" />
              <Sparkles className="h-3.5 w-3.5 fill-brand" />
              <span className="h-px flex-1 bg-brand/40" />
            </div>
          </div>

          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (mode === 'register') {
                void submitRegister();
              } else {
                void submit();
              }
            }}
          >
            <label className="block space-y-2">
              <span className="text-[11px] font-semibold text-white/70 sm:text-xs">Username</span>
              <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-[#101827]/80 px-4 py-3 transition focus-within:border-brand/80">
                <User className="h-3.5 w-3.5 text-brand" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                  placeholder="Masukkan username"
                />
              </div>
            </label>

            <label className="block space-y-2">
              <span className="text-[11px] font-semibold text-white/70 sm:text-xs">Password</span>
              <div className="flex items-center gap-3 rounded-xl border border-white/20 bg-[#101827]/80 px-4 py-3 transition focus-within:border-brand/80">
                <Lock className="h-3.5 w-3.5 text-brand" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                  placeholder="Masukkan password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="rounded-lg p-1 text-white/55 transition hover:text-white"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </label>

            <div className="flex items-center justify-between gap-3 text-[11px] sm:text-xs">
              <label className="flex items-center gap-2 text-white/60">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-transparent accent-brand"
                />
                Ingat saya
              </label>
              <button type="button" onClick={() => setForgotOpen(true)} className="font-semibold text-brand transition hover:text-brand-light">
                Lupa Password?
              </button>
            </div>

            {mode === 'register' ? (
              <>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-[#101827]/80 px-4 py-3 text-sm text-white outline-none focus:border-brand/80"
                  placeholder="Email member"
                />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-[#101827]/80 px-4 py-3 text-sm text-white outline-none focus:border-brand/80"
                  placeholder="Nomor WhatsApp"
                />
                <div className="rounded-2xl border border-brand/20 bg-brand/10 px-4 py-3 text-xs leading-5 text-pink-100">
                  Registrasi otomatis hanya untuk member. Untuk menjadi reseller, hubungi WhatsApp Admin.
                </div>
              </>
            ) : null}

            {error && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
            {success && <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div>}

            <button
              type="submit"
              disabled={loading}
              onClick={(event) => {
                if (mode === 'register') {
                  event.preventDefault();
                  void submitRegister();
                }
              }}
              className="flex w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-brand-dark via-brand to-brand-light px-5 py-3 text-sm font-extrabold text-white shadow-[0_0_24px_rgba(255,0,127,.3)] transition hover:scale-[1.01] sm:py-3 sm:text-base"
            >
              {loading ? 'Memproses...' : mode === 'login' ? 'LOGIN' : 'REGISTER'}
              <ArrowRight className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setMode((value) => (value === 'login' ? 'register' : 'login'));
                setError('');
              }}
              className="w-full rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/80 transition hover:bg-white/10"
            >
              {mode === 'login' ? 'Daftar Account' : 'Kembali ke Login'}
            </button>

            <div className="flex items-center gap-4 text-sm text-white/45">
              <span className="h-px flex-1 bg-white/15" />
              atau
              <span className="h-px flex-1 bg-white/15" />
            </div>

          <button
            type="button"
            onClick={openWhatsAppRegistration}
            className="flex w-full items-center justify-center rounded-full bg-[#25D366] px-5 py-3 text-sm font-extrabold text-white shadow-[0_0_20px_rgba(37,211,102,.22)] transition duration-300 hover:scale-[1.01] hover:bg-[#20b85a] hover:shadow-[0_0_28px_rgba(37,211,102,.28)] focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2 focus:ring-offset-[#0d1220] sm:py-3 sm:text-base"
          >
              Daftar sekarang lewat WA
          </button>
          </form>

        <p className="mt-4 text-center text-[11px] tracking-[0.18em] text-white/45">
          Code by LotusVolt (Copyright)
        </p>
        </motion.section>
      </div>

      {forgotOpen ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/75 px-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-md rounded-[1.4rem] border border-brand/25 bg-[#0f172a] p-5 shadow-[0_0_40px_rgba(255,46,136,0.22)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-light">Reset Password</p>
                <h3 className="mt-1 text-xl font-black text-white">Lupa Password?</h3>
              </div>
              <button type="button" onClick={() => setForgotOpen(false)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                Tutup
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <input value={forgotUsername} onChange={(e) => setForgotUsername(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-sm text-white outline-none focus:border-brand/60" placeholder="Username" />
              <input value={forgotPhone} onChange={(e) => setForgotPhone(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-sm text-white outline-none focus:border-brand/60" placeholder="Nomor HP" />
              <input value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-sm text-white outline-none focus:border-brand/60" placeholder="Email" />
              {newPassword ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  <p>Password baru Anda:</p>
                  <p className="mt-2 text-2xl font-black tracking-[0.16em] text-white">{newPassword}</p>
                  <p className="mt-2 text-xs text-amber-100">Segera ubah password setelah login.</p>
                </div>
              ) : null}
              {error ? <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
              <button type="button" onClick={submitForgotPassword} disabled={loading} className="w-full rounded-2xl bg-brand px-4 py-3 text-sm font-black text-white disabled:opacity-60">
                {loading ? 'Memproses...' : 'Generate Password Baru'}
              </button>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center text-xs text-white/55">
                Jika ada kendala hubungi admin
                <button
                  type="button"
                  onClick={() => {
                    if (adminWhatsapp) window.open(`https://wa.me/${adminWhatsapp}`, '_blank', 'noopener,noreferrer');
                  }}
                  disabled={!adminWhatsapp}
                  className="mt-2 block w-full rounded-xl bg-[#25D366] px-4 py-2 text-sm font-black text-white disabled:opacity-50"
                >
                  WhatsApp Admin
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      ) : null}
    </motion.div>
  );
}
