import type { ReactNode } from 'react';
import { ImageIcon, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { formatCurrency } from '../utils/format';

export function PageSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4 shadow-[0_0_24px_rgba(255,0,127,0.05)] lg:p-5"
    >
      <div className="mb-4">
        <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-white/35">{subtitle}</p>
        <h2 className="mt-2 text-xl font-extrabold tracking-tight text-white lg:text-[1.7rem]">{title}</h2>
      </div>
      {children}
    </motion.section>
  );
}

export function PageHero({
  title,
  subtitle,
  slogan,
  tone = 'from-brand/15 via-sky-500/10 to-emerald-500/10',
  chips = [],
}: {
  title: string;
  subtitle: string;
  slogan: string;
  tone?: string;
  chips?: string[];
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className={`overflow-hidden rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,11,21,0.96),rgba(12,17,28,0.96))]`}
    >
      <div className={`p-4 lg:p-5 bg-gradient-to-r ${tone}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-white/45">Slogan</p>
            <h1 className="mt-2 text-[1.55rem] font-black tracking-tight text-white lg:text-[2rem]">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/78 lg:text-[15px]">{subtitle}</p>
          </div>
          <div className="inline-flex max-w-md flex-wrap gap-2">
            {chips.map((chip) => (
              <span key={chip} className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5 text-[11px] font-semibold text-white/78">
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-3 text-sm text-white/65 lg:px-5">{slogan}</div>
    </motion.section>
  );
}

export function NeonCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[1.15rem] border border-white/10 bg-[#0f0b15] p-3.5 shadow-[0_14px_28px_rgba(0,0,0,0.18)] lg:p-4 ${className}`}>
      {children}
    </div>
  );
}

export function LinkCard({
  title,
  description,
  href,
  icon: Icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className="rounded-[1.25rem] border border-white/10 bg-[#0f0b15] p-4 transition-shadow duration-200 hover:shadow-lg hover:shadow-brand/10 lg:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/20">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-white lg:text-base">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-white/45">{description}</p>
        </div>
      </div>
      <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-brand">Buka link</div>
    </motion.a>
  );
}

type ProductListItem = {
  name: string;
  price: number;
  note: string;
  tag: string;
  stock?: number;
  image?: string;
};

export function ProductList({ cta = false, items = [] }: { cta?: boolean; items?: ProductListItem[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {items.map((item) => (
        <NeonCard key={item.name}>
          <div className="grid gap-3 sm:grid-cols-[68px_1fr_auto] sm:items-center">
            <div className="grid h-16 w-full place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
              {item.image ? <img src={item.image} alt={item.name} className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-white/30" />}
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-white">{item.name}</p>
              <p className="mt-1 text-xs leading-5 text-white/40">{item.note || 'Produk aktif dari database.'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-white">{formatCurrency(item.price)}</p>
              <span className="mt-1 inline-flex rounded-full border border-brand/20 bg-brand/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white">
                {item.stock !== undefined ? `Stok ${item.stock}` : item.tag}
              </span>
            </div>
          </div>
          {cta ? (
            <button className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10">
              Order Sekarang
            </button>
          ) : null}
        </NeonCard>
      ))}
      {!items.length ? <p className="text-sm text-white/45">Belum ada produk dari database.</p> : null}
    </div>
  );
}

export function TimelineList({
  items,
}: {
  items: { title: string; time: string; amount: number; status: string }[];
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.title + item.time} className="flex items-center justify-between gap-4 rounded-[1.15rem] border border-white/10 bg-[#0f0b15] px-4 py-3.5">
          <div>
            <p className="text-[15px] font-semibold text-white">{item.title}</p>
            <p className="mt-1 text-xs text-white/40">{item.time}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-white">{formatCurrency(item.amount)}</p>
            <span className="mt-1 inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-300">
              {item.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
