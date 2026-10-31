/**
 * Use AFTER requireTeacher. Lets only the admin teacher (see utils/adminUtil.js) through.
 * Everyone else gets 403 and nothing is changed.
 */
export const requireAdmin = (req, res, next) => {
  if (req.teacher && req.teacher.isAdmin) return next();
  return res.status(403).json({
    success: false,
    message: 'Hanya admin boleh mengubah kandungan pembelajaran awam. Anda boleh melihat dan mencuba kandungan ini sahaja.'
  });
};

/** Optional lock (off by default): set CONTENT_ADMIN_ONLY=true to let only the admin edit content. */
export const contentLocked = () => String(process.env.CONTENT_ADMIN_ONLY || '').toLowerCase() === 'true';

/** Off by default => every teacher can edit content. On => GET/HEAD open, writes need the admin. */
export const adminForWrites = (req, res, next) => {
  if (!contentLocked()) return next();
  return req.method === 'GET' || req.method === 'HEAD' ? next() : requireAdmin(req, res, next);
};
export const canEditContent = (teacher) => !contentLocked() || Boolean(teacher && teacher.isAdmin);
