import { Copy, RotateCw, Eye, EyeOff, KeyRound } from 'lucide-react';
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
    <div className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,0,127,0.08))] p-5 shadow-[0_0_32px_rgba(255,0,127,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/20">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">API Credentials</p>
            <p className="text-xs text-white/40">Developer Access</p>
            <p className="text-xs text-white/35">Pengguna: {username}</p>
          </div>
        </div>
        <button
          onClick={() => setVisible((prev) => !prev)}
          className="rounded-2xl border border-white/10 bg-white/5 p-2.5 text-white/70 transition-transform duration-200 hover:scale-105"
          aria-label="Toggle key visibility"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      <p className="mt-4 text-sm leading-6 text-white/70">
        Gunakan kunci API ini untuk mengintegrasikan website atau bot WhatsApp Anda secara langsung ke sistem Premiumin Plus.
      </p>

      <div className="mt-4 rounded-2xl border border-white/10 bg-[#0f0b15] px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/35">Your Secret Key</p>
        <div className="mt-2 font-mono text-sm tracking-[0.18em] text-white/85">
        {visible ? apiKey : maskKey(apiKey)}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={copyKey}
          className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/20 transition-transform duration-200 hover:scale-[1.02]"
        >
          <Copy className="h-4 w-4" />
          {copied ? 'Tersalin' : 'Salin Key'}
        </button>
        <button
          onClick={revokeKey}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 transition-transform duration-200 hover:scale-[1.02] hover:bg-white/10"
        >
          <RotateCw className="h-4 w-4" />
          Refresh Tampilan
        </button>
      </div>
    </div>
  );
}
