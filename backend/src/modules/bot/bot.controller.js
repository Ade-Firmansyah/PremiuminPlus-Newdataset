import {
  createBotPayment,
  getBotCatalog,
  getBotPaymentStatus,
  getUserBotSettings,
  updateBotSession,
  updateUserBotSettings,
} from './bot.service.js';
import { getLockedBalance, getSaldoUtama, getUsableBalance } from '../../services/wallet.service.js';
import { normalizeBotTemplatePayload, renderBotTemplatePreview } from '../../services/bot-template.service.js';
import env from '../../config/env.js';

async function readBotEngineJson(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${env.BOT_ENGINE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.message || `Bot-engine error ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function getBotEngineSession(userId) {
  try {
    const payload = await readBotEngineJson(`/sessions/${userId}/status`);
    return payload?.data || null;
  } catch {
    return null;
  }
}

function mergeEngineSession(settings, engineSession) {
  if (!engineSession) return settings;
  const engineStatus = engineSession.status;
  const nextStatus =
    engineStatus && engineStatus !== 'disconnected'
      ? engineStatus
      : settings.bot_session_status;
  return {
    ...settings,
    bot_session_status: nextStatus,
    qr_image: typeof engineSession.qr_image === 'string' ? engineSession.qr_image : '',
    bot_engine_url: env.BOT_ENGINE_URL,
  };
}

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
          locked_balance: getLockedBalance(req.user),
          usable_balance: getUsableBalance(req.user),
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
    const settings = await getUserBotSettings(req.user);
    const engineSession = ['connecting', 'qr'].includes(settings.bot_session_status)
      ? await getBotEngineSession(req.user.id)
      : null;
    res.json({ status: true, data: mergeEngineSession(settings, engineSession) });
  } catch (error) {
    next(error);
  }
}

export async function botSessionConnect(req, res, next) {
  try {
    const enabledSettings = await updateUserBotSettings(req.user, { enabled: true });
    const settings = await updateBotSession({ ...req.user, ...enabledSettings }, 'connecting');
    const engineResponse = await readBotEngineJson(`/sessions/${req.user.id}/connect`, {
      method: 'POST',
      body: JSON.stringify({ apiKey: req.user.api_key }),
    });
    res.json({ status: true, data: mergeEngineSession(settings, engineResponse?.data || null) });
  } catch (error) {
    error.message = error.name === 'AbortError'
      ? `Bot-engine tidak merespons di ${env.BOT_ENGINE_URL}`
      : error.message || `Bot-engine tidak bisa diakses di ${env.BOT_ENGINE_URL}`;
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
    await readBotEngineJson(`/sessions/${req.user.id}/disconnect`, { method: 'POST' }).catch(() => null);
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

export async function botTemplatePreview(req, res, next) {
  try {
    const current = await getUserBotSettings(req.user);
    const template = normalizeBotTemplatePayload(req.body || {}, current.bot_template || current);
    const previews = renderBotTemplatePreview(template, req.user);
    res.json({
      status: true,
      data: {
        active_theme: template.active_theme,
        template,
        preview: [previews.greeting, previews.stock].join('\n\n'),
        previews,
      },
    });
  } catch (error) {
    next(error);
  }
}
