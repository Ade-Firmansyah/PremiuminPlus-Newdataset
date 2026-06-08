import {
  Banknote,
  BellRing,
  Bot,
  ClipboardList,
  Coins,
  LayoutDashboard,
  Layers3,
  MessageCircle,
  Package,
  ReceiptText,
  ShoppingBag,
  Users,
  Wallet,
  AlertCircle,
  HardDriveDownload,
} from 'lucide-react';
import type { NavSection } from '../components/layout/AppShell';
import type { AppRole } from '../services/api';

export const adminSections: NavSection[] = [
  {
    label: 'Admin Panel',
    items: [
      { label: 'Finance Monitoring', to: '/admin', icon: LayoutDashboard, end: true },
      { label: 'Pending Orders', to: '/admin/pending-orders', icon: AlertCircle },
      { label: 'User Management', to: '/admin/user-management', icon: Users },
      { label: 'System Logs', to: '/admin/monitoring-transaksi', icon: ClipboardList },
      { label: 'Mutasi Saldo', to: '/admin/finance-mutasi-saldo', icon: ReceiptText },
      { label: 'Product & Margin', to: '/admin/product-management', icon: Package },
      { label: 'Bot Monitoring', to: '/admin/bot-settings', icon: Bot },
      { label: 'Notifications', to: '/admin/pesan-notifikasi', icon: BellRing },
      { label: 'Maintenance', to: '/admin/maintenance', icon: HardDriveDownload },
    ],
  },
];

export const dashboardSections: NavSection[] = [
  {
    label: 'Utama',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: Layers3, end: true },
      { label: 'Group Komunitas', to: '/dashboard/komunitas-wa', icon: MessageCircle },
    ],
  },
  {
    label: 'Transaksi',
    items: [
      { label: 'Produk', to: '/dashboard/daftar-harga', icon: Package },
      { label: 'Order Akun', to: '/dashboard/order-akun', icon: ShoppingBag },
      { label: 'Deposit Saldo', to: '/dashboard/deposit-saldo', icon: Coins },
      { label: 'Withdraw', to: '/dashboard/tarik-saldo', icon: Banknote },
      { label: 'Riwayat Transaksi', to: '/dashboard/riwayat-pesanan', icon: ClipboardList },
      { label: 'Mutasi Saldo', to: '/dashboard/mutasi-saldo', icon: ReceiptText },
      { label: 'API Key', to: '/dashboard/api-key', icon: ReceiptText },
    ],
  },
  {
    label: 'Reseller',
    items: [
      { label: 'Profil', to: '/dashboard/profil', icon: Wallet },
      { label: 'Profit Analytics', to: '/dashboard/profit-analytics', icon: LayoutDashboard },
      { label: 'Bot WhatsApp', to: '/dashboard/bot-wa-telegram', icon: Bot },
    ],
  },
];

const resellerPaths = new Set([
  '/dashboard',
  '/dashboard/daftar-harga',
  '/dashboard/order-akun',
  '/dashboard/deposit-saldo',
  '/dashboard/tarik-saldo',
  '/dashboard/riwayat-pesanan',
  '/dashboard/mutasi-saldo',
  '/dashboard/komunitas-wa',
  '/dashboard/bot-wa-telegram',
  '/dashboard/margin-setting',
  '/dashboard/profit-analytics',
  '/dashboard/api-key',
  '/dashboard/profil',
]);

export function getDashboardSections(role: AppRole | string) {
  void role;
  const allowedPaths = resellerPaths;

  return dashboardSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => allowedPaths.has(item.to)),
    }))
    .filter((section) => section.items.length);
}

export function canAccessDashboardPath(role: AppRole | string, path: string) {
  const normalized = String(role || 'reseller').toLowerCase();
  if (normalized === 'admin') return true;
  return resellerPaths.has(path);
}

export const adminPageMeta: Record<string, { title: string; subtitle: string }> = {
  '/admin': {
    title: 'Finance Monitoring',
    subtitle: 'Ringkasan bisnis, revenue, saldo reseller, dan withdraw pending.',
  },
  '/admin/pending-orders': {
    title: 'Pending Orders',
    subtitle: 'Kelola order yang gagal provider atau menunggu input manual. Kirim data, retry, atau refund dengan audit trail.',
  },
  '/admin/user-management': {
    title: 'User Management',
    subtitle: 'Kelola user, edit data, tambah user baru, dan hapus user dari satu layar.',
  },
  '/admin/monitoring-transaksi': {
    title: 'System Logs',
    subtitle: 'Pantau top up dan user order secara terpisah supaya alurnya mudah dibaca.',
  },
  '/admin/finance-mutasi-saldo': {
    title: 'Mutasi Saldo',
    subtitle: 'Ledger saldo masuk dan keluar dengan filter tanggal, user, tipe, export CSV, dan pagination.',
  },
  '/admin/setting-markup': {
    title: 'Margin Rules',
    subtitle: 'Atur markup bertingkat sesuai range harga dengan logika yang lebih masuk akal.',
  },
  '/admin/product-management': {
    title: 'Product & Margin',
    subtitle: 'Kelola produk, stok, harga dasar, markup role, discount, dan key Premku dalam satu halaman.',
  },
  '/admin/bot-settings': {
    title: 'Bot Monitoring',
    subtitle: 'Siapkan prompt, greeting, format order, dan feature flag WhatsApp bot.',
  },
  '/admin/pesan-notifikasi': {
    title: 'Pesan Notifikasi',
    subtitle: 'Kirim broadcast notifikasi ke reseller atau admin.',
  },
  '/admin/system-backup': {
    title: 'Maintenance & Backup',
    subtitle: 'Freeze transaksi, download backup ZIP, restore ZIP, dan siapkan migrasi Railway/Vercel.',
  },
  '/admin/maintenance': {
    title: 'Maintenance & Backup',
    subtitle: 'Freeze transaksi, download backup ZIP, restore ZIP, dan siapkan migrasi Railway/Vercel.',
  },
};
