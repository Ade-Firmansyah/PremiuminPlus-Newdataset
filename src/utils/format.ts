// Utilitas kecil ini dipakai untuk merapikan angka dan teks UI.
export function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID').format(value);
}

export function maskKey(value: string) {
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}
