import { createWithdraw as saveWithdraw } from '../../repositories/withdraw.repo.js';
import { getSaldoUtama } from '../../services/wallet.service.js';

const MIN_WITHDRAW = 50000;

export async function requestWithdraw(user, payload) {
  const numericAmount = Number(payload?.amount);
  const bankName = String(payload?.bank_account || '').trim();
  const accountNumber = String(payload?.account_number || '').trim();
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

  if (getSaldoUtama(user) < numericAmount) {
    const error = new Error('Saldo tidak cukup');
    error.statusCode = 400;
    throw error;
  }

  if (!bankName || !accountNumber) {
    const error = new Error('Bank dan nomor rekening wajib diisi');
    error.statusCode = 400;
    throw error;
  }

  return saveWithdraw({
    user_id: user.id,
    amount: numericAmount,
    bank_account: `${bankName} - ${accountNumber}`,
    notes,
  });
}
