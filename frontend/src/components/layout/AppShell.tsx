import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

// Komponen ini membungkus sidebar, navbar, dan area konten supaya layout tetap konsisten.
export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

interface AppShellProps {
  title: string;
  subtitle: string;
  username: string;
  role: string;
  saldo?: number;
  sections: NavSection[];
  onLogout: () => void;
  children: ReactNode;
}

export function AppShell({ title, subtitle, username, role, saldo, sections, onLogout, children }: AppShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pp-app-bg min-h-dvh overflow-x-hidden text-white">
      <div className="pointer-events-none fixed inset-0 opacity-40">
        <div className="pp-grid-overlay absolute inset-0" />
        <div className="absolute right-[-8rem] top-[-8rem] h-96 w-96 rounded-full bg-brand/12 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-[18rem] h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      </div>
      <Sidebar open={open} sections={sections} onClose={() => setOpen(false)} username={username} role={role} saldo={saldo} onLogout={onLogout} />
      <div className="relative flex min-h-dvh min-w-0 flex-col lg:pl-[280px]">
        <Topbar title={title} subtitle={subtitle} username={username} role={role} saldo={saldo} onMenuClick={() => setOpen(true)} />
        <main className="pp-mobile-safe min-w-0 flex-1 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-4 lg:px-7">
          <div className="mx-auto w-full max-w-[1480px] min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
