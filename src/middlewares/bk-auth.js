const crypto = require('node:crypto');
const { models, requireValue } = require('../services/bk-common');
const COOKIE = 'bk_session';
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}
function allowedOrigins() {
  return (
    process.env.BK_ALLOWED_ORIGINS ||
    (process.env.NODE_ENV === 'production'
      ? ''
      : 'http://localhost:3000,http://127.0.0.1:3000')
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}
function requireOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  requireValue(
    allowedOrigins().includes(req.get('origin')),
    'Origin ไม่ได้รับอนุญาต',
    403,
  );
  next();
}
function sessionToken(req) {
  const entry = (req.headers.cookie || '')
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${COOKIE}=`));
  const token = entry?.slice(COOKIE.length + 1);
  return token && /^[a-f\d]{64}$/.test(token) ? token : null;
}
async function authenticate(req, res, next) {
  const token = sessionToken(req);
  requireValue(token, 'กรุณาเข้าสู่ระบบ', 401);
  const session = await models.bk_sessions.findOne({
    token_hash: hash(token),
    expires_at: { $gt: new Date() },
  });
  requireValue(session, 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', 401);
  const user = await models.bk_users.findOne({
    _id: session.user_id,
    is_active: true,
    deleted_at: null,
    role: { $in: ['admin', 'super_admin'] },
    auth_version: session.auth_version,
  });
  requireValue(user, 'บัญชีนี้ไม่มีสิทธิ์เข้าใช้งาน', 401);
  req.bkUser = user;
  req.bkSession = session;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const csrf = req.get('x-bk-csrf') || '';
    requireValue(
      /^[a-f\d]{64}$/.test(csrf) &&
        crypto.timingSafeEqual(
          Buffer.from(csrf),
          Buffer.from(session.csrf_token),
        ),
      'CSRF token ไม่ถูกต้อง',
      403,
    );
  }
  next();
}
function superAdmin(req, res, next) {
  requireValue(
    req.bkUser.role === 'super_admin',
    'เฉพาะ Super admin เท่านั้น',
    403,
  );
  next();
}
module.exports = {
  COOKIE,
  hash,
  cookieOptions,
  allowedOrigins,
  requireOrigin,
  sessionToken,
  authenticate,
  superAdmin,
};
