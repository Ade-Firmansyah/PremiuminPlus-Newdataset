import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { isMaintenanceMode, premiuminApi, setMaintenanceMode } from './services/api';
import { clearApiKey, saveApiKey } from './store/useAuth';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';

// Komponen ini menjaga sesi login sederhana tanpa API, cukup untuk UI dan navigasi.
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const AdminPanelPage = lazy(() => import('./pages/AdminPanelPage').then((module) => ({ default: module.AdminPanelPage })));

type SessionRole = 'reseller' | 'admin';

interface Session {
  username: string;
  role: SessionRole;
  apiKey: string;
  remember: boolean;
}

interface LoginPayload {
  username: string;
  password: string;
  remember: boolean;
}

const sessionKey = 'premiuminplus:session';
const rememberedUserKey = 'premiuminplus:remembered-user';
const sessionActivityKey = 'premiuminplus:last-activity-at';

function loadSession(): Session | null {
  const raw = localStorage.getItem(sessionKey) || sessionStorage.getItem(sessionKey);
  if (!raw) {
    return null;
  }

  try {
    const lastActivity = Number(localStorage.getItem(sessionActivityKey) || sessionStorage.getItem(sessionActivityKey) || 0);
    if (lastActivity && Date.now() - lastActivity > 10 * 60 * 1000) {
      localStorage.removeItem(sessionKey);
      sessionStorage.removeItem(sessionKey);
      localStorage.removeItem(sessionActivityKey);
      sessionStorage.removeItem(sessionActivityKey);
      clearApiKey();
      sessionStorage.setItem('premiuminplus:auth-message', 'Sesi berakhir karena tidak ada aktivitas.');
      return null;
    }
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function ProtectedRoute({
  session,
  adminOnly,
  children,
}: {
  session: Session | null;
  adminOnly?: boolean;
  children: React.ReactNode;
}) {
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (adminOnly && session.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#03030a] px-6 text-white">
      <div className="w-full max-w-sm rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-5 shadow-[0_0_28px_rgba(255,45,139,0.12)]">
        <div className="h-3 w-28 animate-pulse rounded-full bg-white/10" />
        <div className="mt-4 h-8 w-48 animate-pulse rounded-xl bg-white/10" />
        <div className="mt-3 h-3 w-full animate-pulse rounded-full bg-white/10" />
      </div>
    </div>
  );
}

function MaintenanceBanner({ active, message }: { active: boolean; message: string }) {
  if (!active) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[100] border-b border-amber-400/25 bg-[#171006]/95 px-4 py-3 text-center text-sm font-semibold text-amber-100 shadow-[0_12px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      {message || 'Web sedang maintenance. Transaksi, order, withdraw, dan perubahan data sementara dinonaktifkan.'}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [maintenanceActive, setMaintenanceActive] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [authMessage, setAuthMessage] = useState(() => {
    const message = sessionStorage.getItem('premiuminplus:auth-message') || '';
    sessionStorage.removeItem('premiuminplus:auth-message');
    return message;
  });
  const rememberedUsername = useMemo(() => localStorage.getItem(rememberedUserKey) || '', []);

  useEffect(() => {
    let active = true;
    const onMaintenanceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      const enabled = Boolean(detail?.enabled);
      setMaintenanceActive(enabled);
      if (enabled) {
        setMaintenanceMessage('Backend tidak merespons setelah tiga percobaan. Transaksi sementara dinonaktifkan.');
      }
    };

    const ping = async () => {
      try {
        const response = await premiuminApi.systemStatus();
        if (!active) return;
        const nextMaintenance = Boolean(response.data.maintenance);
        setMaintenanceActive(nextMaintenance);
        setMaintenanceMessage(response.data.message || '');
        setMaintenanceMode(nextMaintenance);
      } catch {
        if (!active) return;
        const fallbackMaintenance = isMaintenanceMode();
        setMaintenanceActive(fallbackMaintenance);
        setMaintenanceMessage(
          fallbackMaintenance
            ? 'Backend tidak merespons setelah tiga percobaan. Transaksi sementara dinonaktifkan.'
            : '',
        );
      }
    };

    void ping();
    const timer = window.setInterval(ping, 45000);
    const onFocus = () => void ping();
    window.addEventListener('focus', onFocus);
    window.addEventListener('premiuminplus:maintenance-change', onMaintenanceChange);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('premiuminplus:maintenance-change', onMaintenanceChange);
    };
  }, []);

  useEffect(() => {
    if (!session?.apiKey) {
      return;
    }

    let active = true;
    premiuminApi
      .me(session.apiKey)
      .then((response) => {
        if (!active) return;
        const nextSession: Session = {
          ...session,
          username: response.data.username,
          role: response.data.role,
          apiKey: response.data.api_key,
        };
        const storage = session.remember ? localStorage : sessionStorage;
        storage.setItem(sessionKey, JSON.stringify(nextSession));
        saveApiKey(nextSession.apiKey, session.remember);
        setSession(nextSession);
      })
      .catch(() => {
        if (!active) return;
        handleLogout();
      });

    return () => {
      active = false;
    };
  }, [session?.apiKey]);

  useEffect(() => {
    if (!session) return;

    const timeoutMs = 10 * 60 * 1000;
    let timer: number | null = null;

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const expireSession = () => {
      localStorage.removeItem(sessionKey);
      sessionStorage.removeItem(sessionKey);
      localStorage.removeItem(sessionActivityKey);
      sessionStorage.removeItem(sessionActivityKey);
      clearApiKey();
      const message = 'Sesi berakhir karena tidak ada aktivitas.';
      sessionStorage.setItem('premiuminplus:auth-message', message);
      setAuthMessage(message);
      setSession(null);
    };

    const resetTimer = () => {
      clearTimer();
      const storage = session.remember ? localStorage : sessionStorage;
      storage.setItem(sessionActivityKey, String(Date.now()));
      timer = window.setTimeout(expireSession, timeoutMs);
    };

    const events: Array<keyof WindowEventMap> = ['mousedown', 'keydown', 'touchstart', 'scroll', 'popstate'];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      clearTimer();
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [session]);

  // Komponen ini menyimpan hasil login di localStorage atau sessionStorage sesuai checkbox.
  const handleLogin = async ({ username, password, remember }: LoginPayload) => {
    const response = await premiuminApi.login({ username, password });

    if (!response.status) {
      throw new Error('Login gagal');
    }

    const nextSession: Session = {
      username: response.user.username,
      role: response.role,
      apiKey: response.api_key,
      remember,
    };

    localStorage.removeItem(sessionKey);
    sessionStorage.removeItem(sessionKey);
    localStorage.removeItem(rememberedUserKey);

    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(sessionKey, JSON.stringify(nextSession));
    storage.setItem(sessionActivityKey, String(Date.now()));

    if (remember) {
      localStorage.setItem(rememberedUserKey, nextSession.username);
    }

    saveApiKey(nextSession.apiKey, remember);

    setAuthMessage('');
    setSession(nextSession);
    return nextSession;
  };

  const handleRegister = async ({ username, password, email, phone }: { username: string; password: string; email?: string; phone?: string }) => {
    await premiuminApi.register({ username, password, email, phone });
  };

  const handleLogout = () => {
    localStorage.removeItem(sessionKey);
    sessionStorage.removeItem(sessionKey);
    localStorage.removeItem(sessionActivityKey);
    sessionStorage.removeItem(sessionActivityKey);
    clearApiKey();
    setAuthMessage('');
    setSession(null);
  };

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <MaintenanceBanner active={maintenanceActive} message={maintenanceMessage} />
        <BrowserRouter>
          <Suspense fallback={<AppLoading />}>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<LoginPage onLogin={handleLogin} initialUsername={rememberedUsername} authMessage={authMessage} />} />
              <Route path="/register" element={<RegisterPage onRegister={handleRegister} />} />
              <Route
                path="/dashboard/*"
                element={
                  <ProtectedRoute session={session}>
                    <DashboardPage session={session!} onLogout={handleLogout} maintenanceActive={maintenanceActive} maintenanceMessage={maintenanceMessage} />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/*"
                element={
                  <ProtectedRoute session={session} adminOnly>
                    <AdminPanelPage session={session!} onLogout={handleLogout} maintenanceActive={maintenanceActive} />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
