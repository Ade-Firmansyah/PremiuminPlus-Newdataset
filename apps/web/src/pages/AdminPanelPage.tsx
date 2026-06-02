import { useLocation } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { adminPageMeta, adminSections } from '../config/navigation';
import { UserManagementPage } from './admin/pages/UserManagementPage';
import { MonitoringTransaksiPage } from './admin/pages/MonitoringTransaksiPage';
import { NotificationBroadcastPage } from './admin/pages/NotificationBroadcastPage';
import { AdminDashboardHome } from './admin/pages/AdminDashboardHome';
import { ProductManagementPage } from './admin/pages/ProductManagementPage';
import { BotSettingsPage } from './admin/pages/BotSettingsPage';
import { BalanceMutationPage } from './admin/pages/BalanceMutationPage';
import { PendingOrdersPage } from './admin/pages/PendingOrdersPage';
import { SystemBackupPage } from './admin/pages/SystemBackupPage';

interface AdminPanelPageProps {
  session: {
    username: string;
    role: string;
    apiKey: string;
  };
  onLogout: () => void;
  maintenanceActive?: boolean;
}

export function AdminPanelPage({ session, onLogout, maintenanceActive = false }: AdminPanelPageProps) {
  const location = useLocation();
  const path = location.pathname === '/admin/' || location.pathname === '/admin/dashboard' ? '/admin' : location.pathname;
  const meta = adminPageMeta[path] || adminPageMeta['/admin'];

  const page = (() => {
    const adminApiKey = session.apiKey;
    if (path === '/admin') return <AdminDashboardHome apiKey={adminApiKey} />;
    if (path === '/admin/pending-orders') return <PendingOrdersPage apiKey={adminApiKey} />;
    if (path === '/admin/monitoring-transaksi') return <MonitoringTransaksiPage apiKey={adminApiKey} />;
    if (path === '/admin/finance-mutasi-saldo') return <BalanceMutationPage apiKey={adminApiKey} />;
    if (path === '/admin/product-management' || path === '/admin/setting-markup') return <ProductManagementPage apiKey={adminApiKey} />;
    if (path === '/admin/bot-settings') return <BotSettingsPage apiKey={adminApiKey} />;
    if (path === '/admin/pesan-notifikasi') return <NotificationBroadcastPage apiKey={adminApiKey} />;
    if (path === '/admin/system-backup' || path === '/admin/maintenance') return <SystemBackupPage apiKey={adminApiKey} />;
    return <UserManagementPage apiKey={adminApiKey} />;
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
      {maintenanceActive ? (
        <div className="mb-4 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-100">
          Maintenance aktif. Admin tetap bisa backup, restore, dan mengelola sistem.
        </div>
      ) : null}
      {page}
    </AppShell>
  );
}
