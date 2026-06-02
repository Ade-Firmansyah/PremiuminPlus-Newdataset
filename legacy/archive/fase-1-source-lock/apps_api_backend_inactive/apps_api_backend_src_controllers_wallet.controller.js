const walletService = require('../services/wallet.service');

async function getSaldo(req, res, next) {
  try {
    const data = await walletService.getSaldoSummary(req.app.locals.db, req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function listSaldoLogs(req, res, next) {
  try {
    const data = await walletService.listSaldoLogs(req.app.locals.db, req.user, req.query || {});
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function listSaldoMutations(req, res, next) {
  try {
    const data = await walletService.listSaldoMutations(req.app.locals.db, req.user, req.query || {});
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSaldo,
  listSaldoLogs,
  listSaldoMutations
};
