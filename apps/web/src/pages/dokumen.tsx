import { BookOpen, Boxes, Code2, KeyRound, ShieldCheck, WalletCards } from 'lucide-react';
import { NeonCard, PageHero, PageSection } from './dashboardPageKit';

const publicEndpoints = [
  ['POST', '/profile', 'Cek profil, role, saldo, usable balance, dan locked balance.'],
  ['POST', '/products', 'List produk provider, manual, dan hybrid dari database/cache.'],
  ['POST', '/stock', 'Cek stok gabungan berdasarkan product_id.'],
  ['POST', '/pay', 'Buat QRIS pembeli akhir dengan nominal sell price.'],
  ['POST', '/pay_status', 'Cek pembayaran, ledger B2B, fulfillment, dan credential.'],
  ['POST', '/cancel_pay', 'Batalkan payment yang masih pending.'],
  ['POST', '/order', 'Create order langsung menggunakan saldo usable.'],
  ['POST', '/status', 'Cek status order dan credential milik owner API key.'],
];

const internalEndpoints = [
  ['GET', '/me', 'Profil akun dashboard.'],
  ['GET', '/products', 'Katalog dan harga final sesuai role.'],
  ['POST', '/order', 'Order menggunakan saldo.'],
  ['GET', '/order/:invoice', 'Cek status order.'],
  ['GET', '/orders', 'Riwayat order.'],
  ['POST', '/deposit', 'Buat QRIS deposit saldo.'],
  ['GET', '/deposit/:invoice', 'Cek status dan kredit deposit secara idempoten.'],
  ['POST', '/deposit/:invoice/cancel', 'Batalkan deposit pending.'],
];

const systems = [
  ['Produk', 'Provider, manual, dan hybrid; hybrid memakai stok manual lalu fallback provider.'],
  ['Wallet', 'Saldo hanya berubah lewat wallet service dan dicatat ke saldo_logs serta saldo_mutations.'],
  ['Ledger B2B', 'Pembayaran buyer masuk, modal owner keluar, profit hanya analytics dan tidak dikredit dua kali.'],
  ['Bot WhatsApp', 'Bot pribadi memakai Public API. Managed Bot hanya reseller/admin dengan locked balance Rp50.000.'],
  ['Maintenance', 'Mutasi reseller diblokir, read-only tetap tersedia, admin tetap dapat recovery.'],
  ['Backup', 'ZIP tervalidasi berisi database, JSON state, settings, metadata, dan checksum.'],
];

const errorCodes = [
  ['400', 'Payload tidak valid, API key ganda berbeda, atau sell price di bawah base price.'],
  ['401', 'API key kosong atau tidak valid.'],
  ['402', 'Saldo usable tidak cukup atau managed bot masih terkunci.'],
  ['403', 'Akun nonaktif, role tidak sesuai, atau invoice bukan milik owner.'],
  ['404', 'Produk, payment, atau invoice tidak ditemukan.'],
  ['409', 'Stok/qty tidak tersedia atau transaksi sudah terminal.'],
  ['502/503/504', 'Provider, maintenance, atau service bot sedang tidak tersedia.'],
];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-5 text-white/72">
      {children}
    </pre>
  );
}

function EndpointGrid({ rows }: { rows: string[][] }) {
  return (
    <div className="grid gap-2">
      {rows.map(([method, path, description]) => (
        <div key={`${method}-${path}`} className="grid gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs md:grid-cols-[150px_minmax(0,1fr)]">
          <code className="font-black text-white">{method} {path}</code>
          <span className="leading-5 text-white/55">{description}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dokumen() {
  const publicBase = 'https://premiuminplus.store/api/public/v1';
  const internalBase = 'https://premiuminplus.store/api';

  return (
    <div className="dokumen space-y-4">
      <PageHero
        title="Dokumentasi Premiumin Plus V3.2.2"
        subtitle="Panduan integrasi berdasarkan route, service, dan kontrak database yang aktif."
        slogan="Gunakan Public API v1 untuk integrasi baru. Internal API tetap tersedia untuk dashboard dan kompatibilitas sistem."
        tone="from-slate-500/15 via-cyan-500/10 to-brand/10"
        chips={['Public API v1', 'B2B Ledger', 'Idempotency', 'Python ringan']}
      />

      <PageSection title="Getting Started" subtitle="Pengenalan">
        <div className="grid gap-4 lg:grid-cols-3">
          <NeonCard>
            <BookOpen className="h-5 w-5 text-brand" />
            <h3 className="mt-3 font-bold text-white">Pengenalan</h3>
            <p className="mt-2 text-sm leading-6 text-white/50">Premiumin Plus adalah platform produk digital B2B. Database lokal menjadi source of truth; Premku hanya dipakai untuk produk provider, QRIS, order, status, dan credential.</p>
          </NeonCard>
          <NeonCard>
            <KeyRound className="h-5 w-5 text-cyan-300" />
            <h3 className="mt-3 font-bold text-white">Autentikasi</h3>
            <p className="mt-2 text-sm leading-6 text-white/50">Pilih satu metode: <code>x-api-key</code>, <code>Authorization: Bearer</code>, atau <code>api_key</code> di body Public API. Key berbeda dari beberapa sumber ditolak.</p>
          </NeonCard>
          <NeonCard>
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <h3 className="mt-3 font-bold text-white">Keamanan</h3>
            <p className="mt-2 text-sm leading-6 text-white/50">Panggil API dari server, bot pribadi, cron, atau backend integrasi. Jangan menaruh key penuh di frontend publik, repository, screenshot, atau log.</p>
          </NeonCard>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <NeonCard>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Base URL Public API v1</p>
            <CodeBlock>{publicBase}</CodeBlock>
          </NeonCard>
          <NeonCard>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">Base URL Internal API</p>
            <CodeBlock>{internalBase}</CodeBlock>
          </NeonCard>
        </div>
      </PageSection>

      <PageSection title="User Endpoints" subtitle="Public API v1">
        <EndpointGrid rows={publicEndpoints} />
      </PageSection>

      <PageSection title="Cek Profile" subtitle="POST /profile">
        <CodeBlock>{`curl -X POST ${publicBase}/profile \\
  -H "content-type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d "{}"`}</CodeBlock>
        <p className="mt-3 text-sm leading-6 text-white/50">Response memuat <code>username</code>, <code>role</code>, <code>saldo</code>, <code>usable_balance</code>, <code>locked_balance</code>, <code>whatsapp</code>, dan <code>registered_at</code>.</p>
      </PageSection>

      <PageSection title="Order Endpoints" subtitle="Create Order dan Cek Status">
        <div className="grid gap-4 lg:grid-cols-2">
          <NeonCard>
            <h3 className="font-bold text-white">Create Order</h3>
            <CodeBlock>{`curl -X POST ${publicBase}/order \\
  -H "content-type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d "{\\"product_id\\":123,\\"qty\\":1,\\"ref_id\\":\\"ORDER-001\\"}"`}</CodeBlock>
            <p className="mt-3 text-xs leading-5 text-white/50">Gunakan <code>ref_id</code> unik. Harga dipilih backend sesuai role dan order memakai saldo usable.</p>
          </NeonCard>
          <NeonCard>
            <h3 className="font-bold text-white">Cek Status</h3>
            <CodeBlock>{`curl -X POST ${publicBase}/status \\
  -H "content-type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d "{\\"invoice\\":\\"ORD-XXXX\\"}"`}</CodeBlock>
            <p className="mt-3 text-xs leading-5 text-white/50">Credential hanya dikembalikan setelah status order sukses dan invoice wajib dimiliki API key yang sama.</p>
          </NeonCard>
        </div>
      </PageSection>

      <PageSection title="Produk dan Stok" subtitle="List Produk dan Cek Stok">
        <div className="grid gap-4 lg:grid-cols-2">
          <NeonCard>
            <Boxes className="h-5 w-5 text-brand" />
            <h3 className="mt-3 font-bold text-white">List Produk</h3>
            <CodeBlock>{`curl -X POST ${publicBase}/products \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "content-type: application/json" \\
  -d "{}"`}</CodeBlock>
          </NeonCard>
          <NeonCard>
            <Boxes className="h-5 w-5 text-cyan-300" />
            <h3 className="mt-3 font-bold text-white">Cek Stok</h3>
            <CodeBlock>{`curl -X POST ${publicBase}/stock \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "content-type: application/json" \\
  -d "{\\"product_id\\":123}"`}</CodeBlock>
          </NeonCard>
        </div>
        <p className="mt-4 text-sm leading-6 text-white/50">Endpoint membaca database/cache Premiumin Plus. Request katalog tidak memanggil provider setiap kali.</p>
      </PageSection>

      <PageSection title="Deposit Endpoints" subtitle="Deposit Saldo, Status Deposit, Cancel Deposit">
        <EndpointGrid rows={internalEndpoints} />
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <NeonCard>
            <WalletCards className="h-5 w-5 text-emerald-300" />
            <h3 className="mt-3 font-bold text-white">Deposit Saldo</h3>
            <CodeBlock>{`POST ${internalBase}/deposit
{"amount":50000}`}</CodeBlock>
          </NeonCard>
          <NeonCard>
            <WalletCards className="h-5 w-5 text-cyan-300" />
            <h3 className="mt-3 font-bold text-white">Status Deposit</h3>
            <CodeBlock>{`GET ${internalBase}/deposit/DEP-XXXX`}</CodeBlock>
          </NeonCard>
          <NeonCard>
            <WalletCards className="h-5 w-5 text-rose-300" />
            <h3 className="mt-3 font-bold text-white">Cancel Deposit</h3>
            <CodeBlock>{`POST ${internalBase}/deposit/DEP-XXXX/cancel`}</CodeBlock>
          </NeonCard>
        </div>
        <p className="mt-4 text-sm leading-6 text-white/50">Saldo dikredit sebesar nominal deposit, bukan <code>total_bayar</code>. <code>processed_at</code> dan row lock mencegah kredit ganda. TTL lokal minimal 30 menit atau mengikuti expiry provider bila lebih cepat.</p>
      </PageSection>

      <PageSection title="Reference" subtitle="Sistem yang Ada">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {systems.map(([title, description]) => (
            <NeonCard key={title}>
              <p className="font-bold text-white">{title}</p>
              <p className="mt-2 text-sm leading-6 text-white/50">{description}</p>
            </NeonCard>
          ))}
        </div>
      </PageSection>

      <PageSection title="Kode Error" subtitle="HTTP Reference">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {errorCodes.map(([code, description]) => (
            <NeonCard key={code}>
              <p className="text-xl font-black text-white">{code}</p>
              <p className="mt-2 text-xs leading-5 text-white/50">{description}</p>
            </NeonCard>
          ))}
        </div>
      </PageSection>

      <PageSection title="Contoh PHP dan Python" subtitle="Integrasi ringan">
        <div className="grid gap-4 xl:grid-cols-2">
          <NeonCard>
            <Code2 className="h-5 w-5 text-brand" />
            <h3 className="mt-3 font-bold text-white">PHP</h3>
            <CodeBlock>{`<?php
$payload = json_encode([
  'product_id' => 123,
  'qty' => 1,
  'ref_id' => 'ORDER-001'
]);

$context = stream_context_create(['http' => [
  'method' => 'POST',
  'header' => "content-type: application/json\\r\\nx-api-key: YOUR_API_KEY\\r\\n",
  'content' => $payload,
  'timeout' => 20
]]);

$result = file_get_contents('${publicBase}/order', false, $context);`}</CodeBlock>
          </NeonCard>
          <NeonCard>
            <Code2 className="h-5 w-5 text-cyan-300" />
            <h3 className="mt-3 font-bold text-white">Python tanpa dependency</h3>
            <CodeBlock>{`import json
from urllib.request import Request, urlopen

payload = json.dumps({
    "product_id": 123,
    "qty": 1,
    "ref_id": "ORDER-001"
}).encode()

request = Request(
    "${publicBase}/order",
    data=payload,
    headers={
        "content-type": "application/json",
        "x-api-key": "YOUR_API_KEY"
    },
    method="POST"
)

with urlopen(request, timeout=20) as response:
    result = json.load(response)`}</CodeBlock>
          </NeonCard>
        </div>
        <p className="mt-4 text-sm leading-6 text-white/50">Backend production tetap Node.js. Python dipakai sebagai contoh client standard library agar integrasi ringan tanpa menambah service Railway atau dependency baru.</p>
      </PageSection>
    </div>
  );
}
