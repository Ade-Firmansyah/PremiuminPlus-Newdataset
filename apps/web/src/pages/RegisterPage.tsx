import { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, MessageCircle, Sparkles, User, Mail, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import logoUpScale from '../asset/logo-upscale.png';
import { premiuminApi } from '../services/api';

interface RegisterPageProps {
  onRegister: (payload: {
    username: string;
    password: string;
    email?: string;
    phone?: string;
  }) => Promise<void>;
  authMessage?: string;
}

export function RegisterPage({ onRegister, authMessage = '' }: RegisterPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState('');
  const [adminWhatsapp, setAdminWhatsapp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (authMessage) setSuccess(authMessage);
  }, [authMessage]);

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
    setSuccess('');
    setLoading(true);

    try {
      await onRegister({
        username: username.trim(),
        password,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setSuccess('Pendaftaran berhasil, silakan login.');
      navigate('/login');
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
              Daftar untuk akses produk digital premium
            </p>
            <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-white/50">
              Bergabunglah dengan komunitas reseller dan pengguna aktif kami.
            </p>
          </div>
        </motion.section>

        <motion.section
          className="flex min-h-0 flex-col justify-center px-2"
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.1 }}
        >
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Daftar Akun</h2>
            </div>

            {error && (
              <motion.div
                className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {error}
              </motion.div>
            )}

            {success && (
              <motion.div
                className="mb-4 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-400"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {success}
              </motion.div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium mb-1">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/5 py-3 pl-10 pr-3 text-white placeholder:text-white/50 focus:border-brand focus:outline-none"
                    placeholder="Masukkan username"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/5 py-3 pl-10 pr-10 text-white placeholder:text-white/50 focus:border-brand focus:outline-none"
                    placeholder="Masukkan password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Email (Opsional)</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/5 py-3 pl-10 pr-3 text-white placeholder:text-white/50 focus:border-brand focus:outline-none"
                    placeholder="Masukkan email"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Phone (Opsional)</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/5 py-3 pl-10 pr-3 text-white placeholder:text-white/50 focus:border-brand focus:outline-none"
                    placeholder="Masukkan nomor telepon"
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-brand py-3 font-semibold text-white hover:bg-brand-dark focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-50"
              >
                {loading ? 'Mendaftarkan...' : 'Daftar'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-white/70">
                Sudah punya akun?{' '}
                <button
                  onClick={() => navigate('/login')}
                  className="text-brand hover:underline"
                >
                  Login
                </button>
              </p>
            </div>

            <div className="mt-4 text-center">
              <button
                onClick={openWhatsAppRegistration}
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
              >
                <MessageCircle className="h-4 w-4" />
                Daftar Reseller via WhatsApp
              </button>
            </div>
          </div>
        </motion.section>
      </div>
    </motion.div>
  );
}
