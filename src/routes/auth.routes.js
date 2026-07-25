const express = require('express');
const { body } = require('express-validator');
const { register, login, google, me } = require('../controllers/auth.controller');
const auth = require('../middlewares/auth');

const router = express.Router();

router.post(
  '/register',
  [
    body('email').isEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 6 }).withMessage('Min 6 chars'),
    body('display_name').optional().isString()
  ],
  register
);

router.post(
  '/login',
  [
    body('email').isEmail(),
    body('password').isString()
  ],
  login
);

router.post(
  '/google',
  [body('id_token').isString().notEmpty()],
  google
);

router.get('/me', auth, me);

module.exports = router;
