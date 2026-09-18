const express = require('express');
const cors = require('cors');
const { ZodError } = require('zod');
const {
  models,
  publicUser,
  z,
  text,
  audit,
  mongoose,
} = require('../services/bk-common');
const {
  allowedOrigins,
  requireOrigin,
  authenticate,
} = require('../middlewares/bk-auth');
const router = express.Router();
router.use(
  cors({
    origin: (origin, callback) =>
      callback(null, !origin || allowedOrigins().includes(origin)),
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-Bk-Csrf'],
  }),
);
router.use(express.json({ limit: '500kb' }));
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(requireOrigin);
router.use('/auth', require('./bk-auth.routes'));
router.use('/public', require('./bk-public.routes').router);
router.use(authenticate);
router.use('/events/:id', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'ID งานไม่ถูกต้อง' });
  const event = await models.bk_events.exists({ _id: req.params.id, deleted_at: null });
  if (!event) return res.status(404).json({ error: 'ไม่พบงาน หรือ Event ถูกลบแล้ว' });
  next();
});
router.use(require('./bk-catalog.routes').router);
router.use(require('./bk-booking.routes'));
router.use(require('./bk-files.routes'));
router.get('/customers', async (req, res) => {
  const users = await models.bk_users
    .find({ role: 'customer', deleted_at: null })
    .sort({ created_at: -1 })
    .limit(500);
  res.json(users.map(publicUser));
});
router.post('/customers', async (req, res) => {
  const input = z
    .object({
      display_name: text(150).min(1),
      phone: text(32).min(5),
      x_account: text(100).optional(),
    })
    .strict()
    .parse(req.body);
  const user = await mongoose.connection.transaction(async (session) => {
    const [created] = await models.bk_users.create(
      [{ ...input, role: 'customer' }],
      { session },
    );
    await audit(req.bkUser, 'create_customer', created, null, session);
    return created;
  });
  res.status(201).json(publicUser(user));
});
router.use((req, res) => res.status(404).json({ error: 'ไม่พบ API' }));
router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof ZodError)
    return res
      .status(400)
      .json({
        error: error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      });
  if (error.name === 'ValidationError')
    return res.status(400).json({
      error: Object.values(error.errors)
        .map((item) => item.message)
        .join('; '),
    });
  if (error.code === 11000 || error.name === 'VersionError')
    return res
      .status(409)
      .json({ error: 'ข้อมูลซ้ำหรือถูกแก้ไขไปแล้ว กรุณาโหลดใหม่' });
  if (error.name === 'MulterError')
    return res
      .status(400)
      .json({ error: 'อัปโหลดรูปภาพได้ครั้งละ 1 ไฟล์ ขนาดไม่เกิน 6 MB' });
  if (error.status)
    return res.status(error.status).json({ error: error.message });
  if (error.code === 20 || error.codeName === 'IllegalOperation')
    return res
      .status(503)
      .json({
        error: 'ระบบจองต้องใช้ MongoDB replica set เพื่อบันทึก transaction',
      });
  console.error('bk request failed:', error.name, error.code || '');
  res.status(500).json({ error: 'บันทึกไม่สำเร็จ กรุณาลองใหม่' });
});
module.exports = router;
