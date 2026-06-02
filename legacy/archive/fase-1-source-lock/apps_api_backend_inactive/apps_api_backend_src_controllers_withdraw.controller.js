const withdrawService = require('../services/withdraw.service');

async function createWithdraw(req, res, next) {
  try {
    const data = await withdrawService.createWithdraw(req.app.locals.db, req.user, req.body || {});
    res.status(201).json({ success: true, message: 'Withdraw berhasil dibuat.', data });
  } catch (error) {
    next(error);
  }
}

async function listWithdraws(req, res, next) {
  try {
    const data = await withdrawService.listWithdraws(req.app.locals.db, req.user, req.query || {});
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function approveWithdraw(req, res, next) {
  try {
    const data = await withdrawService.approveWithdraw(req.app.locals.db, req.params.id);
    res.json({ success: true, message: 'Withdraw berhasil disetujui.', data });
  } catch (error) {
    next(error);
  }
}

async function rejectWithdraw(req, res, next) {
  try {
    const data = await withdrawService.rejectWithdraw(req.app.locals.db, req.params.id, req.body?.admin_note);
    res.json({ success: true, message: 'Withdraw berhasil ditolak.', data });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createWithdraw,
  listWithdraws,
  approveWithdraw,
  rejectWithdraw
};
