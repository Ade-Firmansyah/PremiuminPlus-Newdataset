import crypto from 'node:crypto';
import env from '../../config/env.js';
import { execute } from '../../config/db.js';
import { updateDepositStatus } from '../deposit/deposit.service.js';
import { updateTransactionStatus, findTransactionByInvoice, refundTransaction } from '../../repositories/transaction.repo.js';

function normalizeStatus(payload) {
  return String(payload?.status ?? payload?.data?.status ?? payload?.transaction_status ?? '').toLowerCase();
}

function normalizeInvoice(payload) {
  return payload?.invoice || payload?.ref_id || payload?.data?.invoice || payload?.data?.ref_id;
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
    if (String(invoice).startsWith('DEP')) {
      const deposit = await updateDepositStatus(invoice, status, req.body);
      await logWebhook(req.body, 'processed');
      return res.json({ status: true, data: deposit });
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
