const depositService = require('../services/deposit.service');

async function createDeposit(req, res, next) {
  try {
    const data = await depositService.createDeposit(req.app.locals.db, req.user, req.body || {});
    res.status(201).json({
      success: true,
      message: 'Deposit berhasil dibuat.',
      data
    });
  } catch (error) {
    next(error);
  }
}

async function checkDepositStatus(req, res, next) {
  try {
    const data = await depositService.checkDepositStatus(req.app.locals.db, req.user, req.params.invoice);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
}

async function listDeposits(req, res, next) {
  try {
    const data = await depositService.listDeposits(req.app.locals.db, req.user, req.query || {});
    res.json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createDeposit,
  checkDepositStatus,
  listDeposits
};
