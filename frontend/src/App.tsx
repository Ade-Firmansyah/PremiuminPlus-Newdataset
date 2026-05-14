import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { premiuminApi } from './services/api';
import { clearApiKey, saveApiKey, saveToken } from './store/useAuth';

const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const AdminPanelPage = lazy(() => import('./pages/AdminPanelPage').then((module) => ({ default: module.AdminPanelPage })));

// Komponen ini menjaga sesi login sederhana tanpa API, cukup untuk UI dan navigasi.
type SessionRole = 'member' | 'reseller' | 'admin';

interface Session {
  username: string;
  role: SessionRole;
  apiKey: string;
  token: string;
  theme?: 'dark' | 'light';
  remember: boolean;
}

interface LoginPayload {
  username: string;
  password: string;
  remember: boolean;
}

const sessionKey = 'premiuminplus:session';
const rememberedUserKey = 'premiuminplus:remembered-user';

function loadSession(): Session | null {
  const raw = localStorage.getItem(sessionKey) || sessionStorage.getItem(sessionKey);
  if (!raw) {
    return null;
  }

  try {
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

function RouteFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="h-3 w-28 animate-pulse rounded-full bg-white/15" />
        <div className="mt-4 h-8 w-48 animate-pulse rounded-xl bg-white/10" />
        <div className="mt-6 grid gap-3">
          <div className="h-12 animate-pulse rounded-xl bg-white/10" />
          <div className="h-12 animate-pulse rounded-xl bg-white/10" />
        </div>
      </div>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const rememberedUsername = useMemo(() => localStorage.getItem(rememberedUserKey) || '', []);

  useEffect(() => {
    const theme = session?.theme === 'light' ? 'light' : 'dark';
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [session?.theme]);

  useEffect(() => {
    if (!session?.token && !session?.apiKey) {
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
          token: session.token,
          theme: response.data.theme,
        };
        const storage = session.remember ? localStorage : sessionStorage;
        storage.setItem(sessionKey, JSON.stringify(nextSession));
        saveApiKey(nextSession.apiKey, session.remember);
        if (nextSession.token) saveToken(nextSession.token, session.remember);
        setSession(nextSession);
      })
      .catch(() => {
        if (!active) return;
        handleLogout();
      });

    return () => {
      active = false;
    };
  }, [session?.apiKey, session?.token]);

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
      token: response.token,
      theme: 'dark',
      remember,
    };

    localStorage.removeItem(sessionKey);
    sessionStorage.removeItem(sessionKey);
    localStorage.removeItem(rememberedUserKey);

    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(sessionKey, JSON.stringify(nextSession));

    if (remember) {
      localStorage.setItem(rememberedUserKey, nextSession.username);
    }

    saveApiKey(nextSession.apiKey, remember);
    saveToken(nextSession.token, remember);

    setSession(nextSession);
    return nextSession;
  };

  const handleLogout = () => {
    localStorage.removeItem(sessionKey);
    sessionStorage.removeItem(sessionKey);
    clearApiKey();
    setSession(null);
  };

  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage onLogin={handleLogin} initialUsername={rememberedUsername} />} />
          <Route path="/register" element={<LoginPage onLogin={handleLogin} initialUsername={rememberedUsername} />} />
          <Route
            path="/dashboard/*"
            element={
              <ProtectedRoute session={session}>
                <DashboardPage session={session!} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute session={session} adminOnly>
                <AdminPanelPage session={session!} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
