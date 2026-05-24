import { Navigate, useLocation } from 'react-router-dom';
import { Bot, LayoutDashboard, Package, Users, ClipboardList, SlidersHorizontal, BellRing, Banknote } from 'lucide-react';
import { AppShell, type NavSection } from '../components/layout/AppShell';
import { UserManagementPage } from './admin/pages/UserManagementPage';
import { MonitoringTransaksiPage } from './admin/pages/MonitoringTransaksiPage';
import { SettingMarkupPage } from './admin/pages/SettingMarkupPage';
import { NotificationBroadcastPage } from './admin/pages/NotificationBroadcastPage';
import { AdminDashboardHome } from './admin/pages/AdminDashboardHome';
import { ProductManagementPage } from './admin/pages/ProductManagementPage';
import { BotSettingsPage } from './admin/pages/BotSettingsPage';

interface AdminPanelPageProps {
  session: {
    username: string;
    role: string;
  };
  onLogout: () => void;
}

const adminSections: NavSection[] = [
  {
    label: 'Admin Panel',
    items: [
      { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true },
      { label: 'Finance Monitoring', to: '/admin/monitoring-transaksi', icon: Banknote },
      { label: 'User Management', to: '/admin/user-management', icon: Users },
      { label: 'Product & Margin', to: '/admin/product-management', icon: Package },
      { label: 'Withdraw Management', to: '/admin/withdraw-management', icon: ClipboardList },
      { label: 'Bot Monitoring', to: '/admin/bot-settings', icon: Bot },
      { label: 'Notifications', to: '/admin/pesan-notifikasi', icon: BellRing },
      { label: 'Markup Rules', to: '/admin/setting-markup', icon: SlidersHorizontal },
    ],
  },
];

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  '/admin': {
    title: 'Admin Dashboard',
    subtitle: 'Ringkasan bisnis, revenue, saldo reseller, dan withdraw pending.',
  },
  '/admin/user-management': {
    title: 'User Management',
    subtitle: 'Kelola user, edit data, tambah user baru, dan hapus user dari satu layar.',
  },
  '/admin/monitoring-transaksi': {
    title: 'Finance Monitoring',
    subtitle: 'Pantau top up, order user, withdraw, dan audit dari satu pusat monitoring.',
  },
  '/admin/setting-markup': {
    title: 'Markup Rules',
    subtitle: 'Atur markup bertingkat sesuai range harga dengan logika yang lebih masuk akal.',
  },
  '/admin/product-management': {
    title: 'Product Management',
    subtitle: 'Kelola produk, stok, harga dasar, dan margin admin.',
  },
  '/admin/bot-settings': {
    title: 'Bot Monitoring',
    subtitle: 'Siapkan prompt, greeting, format order, dan feature flag WhatsApp bot.',
  },
  '/admin/withdraw-management': {
    title: 'Withdraw Management',
    subtitle: 'Validasi tiket penarikan, tujuan transfer, dan status pembayaran manual.',
  },
  '/admin/pesan-notifikasi': {
    title: 'Pesan Notifikasi',
    subtitle: 'Kirim broadcast notifikasi ke anggota, member, reseller, atau admin.',
  },
};

export function AdminPanelPage({ session, onLogout }: AdminPanelPageProps) {
  const location = useLocation();
  const path = location.pathname === '/admin/' ? '/admin' : location.pathname;
  const meta = pageMeta[path] || pageMeta['/admin'];

  const page = (() => {
    if (path === '/admin/system-logs') return <Navigate to="/admin/monitoring-transaksi" replace />;
    if (path === '/admin/markup-rules') return <Navigate to="/admin/setting-markup" replace />;
    if (path === '/admin') return <AdminDashboardHome />;
    if (path === '/admin/monitoring-transaksi') return <MonitoringTransaksiPage />;
    if (path === '/admin/withdraw-management') return <MonitoringTransaksiPage initialTab="withdraw" />;
    if (path === '/admin/product-management') return <ProductManagementPage />;
    if (path === '/admin/setting-markup') return <SettingMarkupPage />;
    if (path === '/admin/bot-settings') return <BotSettingsPage />;
    if (path === '/admin/pesan-notifikasi') return <NotificationBroadcastPage />;
    return <UserManagementPage />;
  })();

  return (
    <AppShell
      title={meta.title}
      subtitle={meta.subtitle}
      username={session.username}
      role="admin"
      sections={adminSections}
      onLogout={onLogout}
    >
      {page}
    </AppShell>
  );
}
