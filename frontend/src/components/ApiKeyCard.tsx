import { Code2, Copy, Eye, EyeOff, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { maskKey } from '../utils/format';

// Komponen ini menampilkan API key dari database dengan aksi salin dan toggle tampilan.
interface ApiKeyCardProps {
  username: string;
  apiKey: string;
}

export function ApiKeyCard({ username, apiKey }: ApiKeyCardProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyKey = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const revokeKey = () => {
    setVisible(false);
    setCopied(false);
  };

  return (
    <div className="h-full rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.035))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.18)] sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-200 ring-1 ring-sky-400/20">
            <Code2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-black text-white">API Credentials</p>
            <p className="mt-1 truncate text-xs text-white/40">Pengguna: {username}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/55">
          Developer Access
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-white/58">
        Gunakan kunci API ini untuk mengintegrasikan website atau bot WhatsApp Anda secara langsung ke sistem Premiumin Plus.
      </p>

      <div className="mt-4 rounded-2xl border border-white/10 bg-[#0f0b15] px-3 py-3 sm:px-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">Your Secret Key</p>
        <div className="mt-2 flex min-h-10 items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3">
          <div className="min-w-0 flex-1 truncate font-mono text-sm tracking-[0.16em] text-white/85">
            {visible ? apiKey : maskKey(apiKey)}
          </div>
          <button
            onClick={() => setVisible((prev) => !prev)}
            className="shrink-0 rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Toggle key visibility"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          onClick={copyKey}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-black/20 transition-transform duration-200 hover:scale-[1.01]"
        >
          <Copy className="h-4 w-4" />
          {copied ? 'Tersalin' : 'Salin Key'}
        </button>
        <button
          onClick={revokeKey}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200 transition-transform duration-200 hover:scale-[1.01] hover:bg-rose-500/15"
        >
          <RotateCw className="h-4 w-4" />
          Revoke
        </button>
      </div>
    </div>
  );
}
