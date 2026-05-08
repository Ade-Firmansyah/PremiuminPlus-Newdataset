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
    <div className="min-h-screen bg-[#07040a] text-white">
      <Sidebar open={open} sections={sections} onClose={() => setOpen(false)} username={username} role={role} saldo={saldo} onLogout={onLogout} />
      <div className="min-h-screen flex flex-col lg:pl-[264px]">
        <Topbar title={title} subtitle={subtitle} username={username} role={role} saldo={saldo} onMenuClick={() => setOpen(true)} />
        <main className="flex-1 px-3 py-4 sm:px-4 lg:px-6">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
