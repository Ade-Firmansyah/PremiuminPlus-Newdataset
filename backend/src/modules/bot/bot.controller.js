import {
  createBotPayment,
  getBotCatalog,
  getBotPaymentStatus,
  getUserBotSettings,
  updateBotSession,
  updateUserBotSettings,
} from './bot.service.js';
import { getSaldoUtama } from '../../services/wallet.service.js';

export async function botProfile(req, res, next) {
  try {
    const saldoUtama = getSaldoUtama(req.user);
    res.json({
      status: true,
      data: {
        user: {
          id: req.user.id,
          username: req.user.username,
          role: req.user.role,
          saldo_utama: saldoUtama,
          saldo: saldoUtama,
          locked_balance: Number(req.user.locked_balance || 0),
        },
        settings: await getUserBotSettings(req.user),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function botCatalog(req, res, next) {
  try {
    res.json({ status: true, data: await getBotCatalog(req.user) });
  } catch (error) {
    next(error);
  }
}

export async function botOrder(req, res, next) {
  try {
    const order = await createBotPayment(req.user, req.body || {});
    res.status(201).json({ status: true, data: order });
  } catch (error) {
    next(error);
  }
}

export async function botPaymentStatus(req, res, next) {
  try {
    const payment = await getBotPaymentStatus(req.user, req.params.invoice);
    if (!payment) return res.status(404).json({ status: false, message: 'Payment tidak ditemukan' });
    return res.json({ status: true, data: payment });
  } catch (error) {
    return next(error);
  }
}

export async function botSessionStatus(req, res, next) {
  try {
    res.json({ status: true, data: await getUserBotSettings(req.user) });
  } catch (error) {
    next(error);
  }
}

export async function botSessionConnect(req, res, next) {
  try {
    const enabledSettings = await updateUserBotSettings(req.user, { enabled: true });
    const settings = await updateBotSession({ ...req.user, ...enabledSettings }, 'connecting');
    res.json({ status: true, data: settings });
  } catch (error) {
    next(error);
  }
}

export async function botSessionUpdate(req, res, next) {
  try {
    const settings = await updateBotSession(req.user, req.body?.status);
    res.json({ status: true, data: settings });
  } catch (error) {
    next(error);
  }
}

export async function botSessionLogout(req, res, next) {
  try {
    const settings = await updateBotSession(req.user, 'logged_out');
    res.json({ status: true, data: settings });
  } catch (error) {
    next(error);
  }
}

export async function botSettingsGet(req, res, next) {
  try {
    res.json({ status: true, data: await getUserBotSettings(req.user) });
  } catch (error) {
    next(error);
  }
}

export async function botSettingsUpdate(req, res, next) {
  try {
    res.json({ status: true, data: await updateUserBotSettings(req.user, req.body || {}) });
  } catch (error) {
    next(error);
  }
}
