const authService = require('../services/auth.service');

async function login(req, res, next) {
  try {
    const data = await authService.login(req.app.locals.db, req.body || {});
    res.json({
      success: true,
      message: 'Login berhasil.',
      data
    });
  } catch (error) {
    next(error);
  }
}

async function me(req, res, next) {
  try {
    const data = await authService.me(req.user);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  me
};
