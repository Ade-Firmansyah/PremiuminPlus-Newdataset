import { createWithdraw as saveWithdraw, sumPendingWithdrawAmountByUser } from '../../repositories/withdraw.repo.js';
import { getUsableBalance } from '../../services/wallet.service.js';

const MIN_WITHDRAW = 50000;
const ALLOWED_METHODS = new Set(['BRI', 'SEABANK', 'GOPAY', 'SHOPEEPAY']);

function normalizeMethod(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (normalized === 'SEA BANK') return 'SEABANK';
  if (normalized === 'SHOPEE PAY') return 'SHOPEEPAY';
  return normalized;
}

function calculateWithdrawFee(amount) {
  if (amount <= 50000) return 500;
  if (amount <= 200000) return 1000;
  return Math.ceil(amount * 0.02);
}

export async function requestWithdraw(user, payload) {
  const numericAmount = Number(payload?.amount);
  const method = normalizeMethod(payload?.withdraw_method || payload?.method || payload?.bank_account);
  const accountNumber = String(payload?.account_number || '').replace(/[^\d]/g, '').slice(0, 30);
  const accountName = String(payload?.account_name || payload?.account_holder || '').trim().slice(0, 120);
  const notes = String(payload?.notes || '').trim();

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    const error = new Error('Nominal saldo tidak valid');
    error.statusCode = 400;
    throw error;
  }

  if (numericAmount < MIN_WITHDRAW) {
    const error = new Error(`Minimal tarik saldo Rp${MIN_WITHDRAW.toLocaleString('id-ID')}`);
    error.statusCode = 400;
    throw error;
  }

  const saldo = getUsableBalance(user);
  const pendingWithdrawAmount = await sumPendingWithdrawAmountByUser(user.id);
  if (saldo - pendingWithdrawAmount < numericAmount) {
    const error = new Error('Saldo tidak cukup');
    error.statusCode = 400;
    throw error;
  }

  if (!ALLOWED_METHODS.has(method)) {
    const error = new Error('Metode penarikan hanya BRI, SeaBank, GoPay, dan ShopeePay');
    error.statusCode = 400;
    throw error;
  }

  if (!accountNumber || !accountName) {
    const error = new Error('Nomor tujuan dan nama pemilik wajib diisi');
    error.statusCode = 400;
    throw error;
  }

  const fee = calculateWithdrawFee(numericAmount);
  const netAmount = numericAmount - fee;
  if (netAmount <= 0) {
    const error = new Error('Nominal penarikan terlalu kecil setelah biaya admin');
    error.statusCode = 400;
    throw error;
  }

  return saveWithdraw({
    user_id: user.id,
    amount: numericAmount,
    bank_account: method,
    account_number: accountNumber,
    account_name: accountName,
    withdraw_method: method,
    fee,
    net_amount: netAmount,
    notes,
  });
}
