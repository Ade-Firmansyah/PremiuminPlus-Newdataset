export function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      status: false,
      code: 'ADMIN_ONLY',
      message: 'Akses admin tidak valid. Pastikan login memakai akun admin.',
    });
  }

  next();
}
