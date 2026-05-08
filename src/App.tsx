import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminPanelPage } from './pages/AdminPanelPage';
import { premiuminApi } from './services/api';
import { clearApiKey, saveApiKey } from './store/useAuth';

// Komponen ini menjaga sesi login sederhana tanpa API, cukup untuk UI dan navigasi.
type SessionRole = 'member' | 'reseller' | 'admin';

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

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const rememberedUsername = useMemo(() => localStorage.getItem(rememberedUserKey) || '', []);

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

    if (remember) {
      localStorage.setItem(rememberedUserKey, nextSession.username);
    }

    saveApiKey(nextSession.apiKey, remember);

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
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage onLogin={handleLogin} initialUsername={rememberedUsername} />} />
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
    </BrowserRouter>
  );
}
