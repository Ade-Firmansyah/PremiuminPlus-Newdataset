import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-[var(--pp-radius-lg)] border border-white/10 bg-white/[0.055] p-4 shadow-[0_18px_46px_rgba(0,0,0,.22)]', className)} {...props} />;
}

export function GlassCard({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('pp-glass rounded-[var(--pp-radius-lg)] p-4', className)} {...props} />;
}

export function GradientButton({ className = '', disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={disabled}
      className={cx(
        'pp-button-primary inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-55',
        className,
      )}
      {...props}
    />
  );
}

export function NeonBadge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3 py-1.5 text-[11px] font-bold text-pink-100 shadow-[0_0_18px_rgba(255,46,136,.14)]', className)}>
      {children}
    </span>
  );
}

export function DashboardCard({
  label,
  value,
  hint,
  icon,
  className = '',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <GlassCard className={cx('relative overflow-hidden', className)}>
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-brand/15 blur-2xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/38">{label}</p>
          <div className="mt-2 text-2xl font-black tracking-tight text-white">{value}</div>
          {hint ? <p className="mt-2 text-xs leading-5 text-white/48">{hint}</p> : null}
        </div>
        {icon ? <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-brand/20 bg-brand/10 text-brand">{icon}</div> : null}
      </div>
    </GlassCard>
  );
}

export function StatCard(props: Parameters<typeof DashboardCard>[0]) {
  return <DashboardCard {...props} />;
}

export function LoadingSkeleton({ className = '' }: { className?: string }) {
  return <div className={cx('pp-skeleton min-h-12 rounded-2xl', className)} />;
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 px-4 py-6 backdrop-blur-md">
      <div className="pp-glass-strong w-full max-w-lg rounded-[var(--pp-radius-xl)] p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          {title ? <h2 className="text-xl font-black text-white">{title}</h2> : <span />}
          <button type="button" onClick={onClose} className="rounded-2xl border border-white/10 bg-white/5 p-2 text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  children,
  onClose,
}: {
  open: boolean;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm">
      <button type="button" aria-label="Close drawer" className="absolute inset-0 h-full w-full" onClick={onClose} />
      <aside className="pp-glass-strong absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto rounded-l-[var(--pp-radius-xl)] p-5">{children}</aside>
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xl border border-white/10 bg-[#0b1020] px-3 py-1.5 text-xs text-white/80 opacity-0 shadow-xl transition group-hover:opacity-100">
        {label}
      </span>
    </span>
  );
}

export function Toast({
  type = 'info',
  children,
}: {
  type?: 'info' | 'success' | 'error' | 'loading';
  children: ReactNode;
}) {
  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? AlertTriangle : type === 'loading' ? Loader2 : Info;
  return (
    <div className={cx('inline-flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-xl backdrop-blur', type === 'error' ? 'border-rose-400/25 bg-rose-500/10 text-rose-100' : type === 'success' ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-white/10 text-white/80')}>
      <Icon className={cx('h-4 w-4', type === 'loading' && 'animate-spin')} />
      {children}
    </div>
  );
}

export function EmptyState({ title = 'Belum ada data', description = 'Data akan tampil ketika backend mengirimkan informasi terbaru.' }) {
  return (
    <Card className="grid place-items-center py-10 text-center">
      <p className="text-base font-black text-white">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-white/48">{description}</p>
    </Card>
  );
}

export function ErrorState({ title = 'Gagal memuat data', description }: { title?: string; description?: string }) {
  return (
    <Card className="border-rose-400/20 bg-rose-500/10">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
        <div>
          <p className="font-black text-white">{title}</p>
          {description ? <p className="mt-1 text-sm leading-6 text-rose-100/80">{description}</p> : null}
        </div>
      </div>
    </Card>
  );
}
