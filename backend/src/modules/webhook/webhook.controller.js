import crypto from 'node:crypto';
import env from '../../config/env.js';
import { execute } from '../../config/db.js';
import { updateDepositStatus } from '../deposit/deposit.service.js';
import { findDepositByInvoice } from '../../repositories/deposit.repo.js';
import { updateTransactionStatus, findTransactionByInvoice, refundTransaction } from '../../repositories/transaction.repo.js';
import { syncPaymentStatusFromWebhook } from '../payment/payment.service.js';

function normalizeStatus(payload) {
  return String(
    payload?.pay_status ??
      payload?.data?.pay_status ??
      payload?.payment_status ??
      payload?.data?.payment_status ??
      payload?.transaction_status ??
      payload?.data?.transaction_status ??
      payload?.status_pembayaran ??
      payload?.data?.status_pembayaran ??
      payload?.status_bayar ??
      payload?.data?.status_bayar ??
      payload?.data?.status ??
      (typeof payload?.status === 'string' ? payload.status : ''),
  ).toLowerCase();
}

function normalizeInvoice(payload) {
  return payload?.invoice || payload?.invoice_id || payload?.ref_id || payload?.id || payload?.data?.invoice || payload?.data?.invoice_id || payload?.data?.ref_id || payload?.data?.id;
}

function validateWebhookSecret(req) {
  const expected = String(env.PREMKU_WEBHOOK_SECRET || '').trim();
  if (!expected) {
    return true;
  }

  const received = String(req.headers['x-premku-signature'] || req.headers['x-webhook-secret'] || '').trim();
  if (!received || received.length !== expected.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function logWebhook(payload, status) {
  try {
    await execute(
      `INSERT INTO webhook_logs (source, payload, status)
       VALUES ('premku', CAST(? AS JSON), ?)`,
      [JSON.stringify(payload), status],
    );
  } catch {
    // Logging must never break the callback flow.
  }
}

export async function premkuWebhook(req, res) {
  if (!validateWebhookSecret(req)) {
    await logWebhook(req.body, 'rejected');
    return res.status(401).json({ status: false, message: 'Invalid webhook secret' });
  }

  const invoice = normalizeInvoice(req.body);
  const status = normalizeStatus(req.body);

  if (!invoice) {
    await logWebhook(req.body, 'invalid');
    return res.status(400).json({ status: false, message: 'invoice/ref_id wajib diisi' });
  }

  try {
    const depositRow = await findDepositByInvoice(invoice);
    if (depositRow || String(invoice).startsWith('DEP')) {
      const deposit = await updateDepositStatus(invoice, status, req.body);
      await logWebhook(req.body, 'processed');
      return res.json({ status: true, data: deposit });
    }

    const payment = await syncPaymentStatusFromWebhook(invoice, req.body);
    if (payment) {
      await logWebhook(req.body, 'processed');
      return res.json({ status: true, data: payment });
    }

    if (String(invoice).startsWith('ORD')) {
      const transaction = await findTransactionByInvoice(invoice);
      if (!transaction) {
        await logWebhook(req.body, 'not-found');
        return res.status(404).json({ status: false, message: 'Transaksi tidak ditemukan' });
      }

      if (['failed', 'fail', 'gagal', 'error', 'cancel', 'expired'].includes(status) && transaction.status !== 'failed') {
        await refundTransaction(invoice, req.body, 'premku-webhook-failed');
      } else if (['success', 'sukses'].includes(status)) {
        await updateTransactionStatus(invoice, 'success', {
          external_status_response: req.body,
          account_data:
            req.body.accounts ||
            req.body?.data?.accounts ||
            req.body.account_data ||
            req.body?.data?.account_data ||
            transaction.account_data ||
            null,
        });
      } else {
        await updateTransactionStatus(invoice, status || 'processing', { external_status_response: req.body });
      }

      await logWebhook(req.body, 'processed');
      return res.json({ status: true, data: await findTransactionByInvoice(invoice) });
    }

    await logWebhook(req.body, 'ignored');
    return res.json({ status: true, message: 'Webhook ignored' });
  } catch (error) {
    await logWebhook(req.body, 'error');
    return res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || 'Webhook gagal diproses',
    });
  }
}
