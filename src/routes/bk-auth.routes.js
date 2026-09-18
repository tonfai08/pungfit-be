const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const {
  models,
  z,
  text,
  requireValue,
  publicUser,
  audit,
  mongoose,
  objectId,
} = require('../services/bk-common');
const {
  COOKIE,
  hash,
  cookieOptions,
  sessionToken,
  authenticate,
  superAdmin,
} = require('../middlewares/bk-auth');
const router = express.Router();
const password = z
  .string()
  .min(12, 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร')
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'รหัสผ่านยาวเกิน 72 bytes',
  );
const email = z.string().trim().toLowerCase().email().max(254);
const dummyHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);

router.post('/login', async (req, res) => {
  const input = z
    .object({ email, password: z.string().max(200) })
    .strict()
    .parse(req.body);
  const bucket = Math.floor(Date.now() / 900000);
  // Persisted per-account limit cannot be bypassed with a forged forwarding IP.
  for (const [key, max] of [
    [`account:${input.email}`, 20],
    [`ip:${req.ip}`, 100],
  ]) {
    const limit = await models.bk_login_limits.findOneAndUpdate(
      { _id: hash(`${key}:${bucket}`) },
      {
        $inc: { count: 1 },
        $setOnInsert: { expires_at: new Date((bucket + 2) * 900000) },
      },
      { upsert: true, new: true },
    );
    requireValue(
      limit.count <= max,
      'ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาที',
      429,
    );
  }
  const user = await models.bk_users
    .findOne({ email: input.email })
    .select('+password_hash');
  const matches = await bcrypt.compare(
    input.password,
    user?.password_hash || dummyHash,
  );
  requireValue(
    matches &&
      user?.is_active &&
      !user.deleted_at &&
      ['admin', 'super_admin'].includes(user.role),
    'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    401,
  );
  const old = sessionToken(req);
  if (old) await models.bk_sessions.deleteOne({ token_hash: hash(old) });
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(32).toString('hex');
  await models.bk_sessions.create({
    token_hash: hash(token),
    csrf_token: csrf,
    user_id: user._id,
    auth_version: user.auth_version,
    expires_at: new Date(Date.now() + 8 * 3600000),
  });
  res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: 8 * 3600000 });
  res.json({ user: publicUser(user), csrf });
});
router.use(authenticate);
router.get('/me', (req, res) =>
  res.json({ user: publicUser(req.bkUser), csrf: req.bkSession.csrf_token }),
);
router.post('/logout', async (req, res) => {
  await models.bk_sessions.deleteOne({ _id: req.bkSession._id });
  res.clearCookie(COOKIE, cookieOptions()).json({ ok: true });
});
router.post('/password', async (req, res) => {
  const input = z
    .object({ current_password: z.string().max(200), new_password: password })
    .strict()
    .parse(req.body);
  const user = await models.bk_users
    .findById(req.bkUser._id)
    .select('+password_hash');
  requireValue(
    await bcrypt.compare(input.current_password, user.password_hash),
    'รหัสผ่านปัจจุบันไม่ถูกต้อง',
    400,
  );
  const passwordHash = await bcrypt.hash(input.new_password, 12);
  await mongoose.connection.transaction(async (session) => {
    user.password_hash = passwordHash;
    user.auth_version += 1;
    await user.save({ session });
    await models.bk_sessions.deleteMany({ user_id: user._id }, { session });
    await audit(user, 'change_password', user, null, session);
  });
  res.clearCookie(COOKIE, cookieOptions()).json({ ok: true });
});
router.get('/admins', superAdmin, async (req, res) => {
  const users = await models.bk_users
    .find({ role: { $in: ['admin', 'super_admin'] }, deleted_at: null })
    .sort({ created_at: -1 })
    .limit(500);
  res.json(users.map(publicUser));
});
router.post('/admins', superAdmin, async (req, res) => {
  const input = z
    .object({ email, display_name: text(150).min(1), password })
    .strict()
    .parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await mongoose.connection.transaction(async (session) => {
    const [created] = await models.bk_users.create(
      [
        {
          email: input.email,
          display_name: input.display_name,
          password_hash: passwordHash,
          role: 'admin',
        },
      ],
      { session },
    );
    await audit(req.bkUser, 'create_admin', created, null, session);
    return created;
  });
  res.status(201).json(publicUser(user));
});
router.patch('/admins/:id', superAdmin, async (req, res) => {
  objectId.parse(req.params.id);
  const input = z
    .object({
      display_name: text(150).min(1).optional(),
      is_active: z.boolean().optional(),
      password: password.optional(),
    })
    .strict()
    .parse(req.body);
  const passwordHash = input.password
    ? await bcrypt.hash(input.password, 12)
    : null;
  const user = await mongoose.connection.transaction(async (session) => {
    const target = await models.bk_users
      .findOne({ _id: req.params.id, role: 'admin', deleted_at: null })
      .session(session);
    requireValue(
      target,
      'ไม่พบแอดมิน หรือเป็นบัญชี Super admin ที่แก้ไขไม่ได้',
      404,
    );
    if (input.display_name !== undefined)
      target.display_name = input.display_name;
    if (input.is_active !== undefined) target.is_active = input.is_active;
    if (passwordHash) target.password_hash = passwordHash;
    target.auth_version += 1;
    await target.save({ session });
    await models.bk_sessions.deleteMany({ user_id: target._id }, { session });
    await audit(req.bkUser, 'update_admin', target, null, session, {
      is_active: target.is_active,
    });
    return target;
  });
  res.json(publicUser(user));
});
router.delete('/admins/:id', superAdmin, async (req, res) => {
  objectId.parse(req.params.id);
  await mongoose.connection.transaction(async (session) => {
    const target = await models.bk_users
      .findOne({ _id: req.params.id, role: 'admin', deleted_at: null })
      .session(session);
    requireValue(
      target,
      'ไม่พบแอดมิน หรือเป็นบัญชี Super admin ที่ลบไม่ได้',
      404,
    );
    target.is_active = false;
    target.deleted_at = new Date();
    target.auth_version += 1;
    await target.save({ session });
    await models.bk_sessions.deleteMany({ user_id: target._id }, { session });
    await audit(req.bkUser, 'delete_admin', target, null, session);
  });
  res.json({ ok: true });
});
module.exports = router;
