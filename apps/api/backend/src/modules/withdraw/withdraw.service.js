import { createWithdraw as saveWithdraw } from '../../repositories/withdraw.repo.js';
import { notifyAdmin } from '../../services/notification.service.js';

const MIN_WITHDRAW = 50000;
const MAX_WITHDRAW = 1000000;
const ALLOWED_BANKS = new Set(['BRI', 'JAGO', 'SEABANK', 'SHOPEPAY', 'GOPAY']);

export async function requestWithdraw(user, payload) {
  const numericAmount = Number(payload?.amount);
  const bankName = String(payload?.bank_name || payload?.method || payload?.bank_account || '').trim().toUpperCase();
  const accountNumber = String(payload?.account_number || '').trim();
  const accountName = String(payload?.account_name || '').trim();
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

  if (numericAmount > MAX_WITHDRAW) {
    const error = new Error(`Maksimal tarik saldo Rp${MAX_WITHDRAW.toLocaleString('id-ID')}`);
    error.statusCode = 400;
    throw error;
  }

  if (user.saldo < numericAmount) {
    const error = new Error('Saldo tidak cukup');
    error.statusCode = 400;
    throw error;
  }

  if (!bankName || !accountNumber || !accountName) {
    const error = new Error('Bank dan nomor rekening wajib diisi');
    error.statusCode = 400;
    throw error;
  }

  if (!ALLOWED_BANKS.has(bankName)) {
    const error = new Error('Bank atau e-wallet tidak tersedia');
    error.statusCode = 400;
    throw error;
  }

  const data = await saveWithdraw({
    user_id: user.id,
    amount: numericAmount,
    bank_account: `${bankName} - ${accountNumber}`,
    bank_name: bankName,
    method: bankName,
    account_number: accountNumber,
    account_name: accountName,
    notes,
  });
  void notifyAdmin('withdraw request', {
    user: user.username,
    amount: numericAmount,
    status: 'PENDING',
  });
  return data;
}
