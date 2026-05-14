export function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      status: false,
      message: 'Admin only',
    });
  }

  next();
}
