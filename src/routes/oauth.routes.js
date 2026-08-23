const express = require('express');
const auth = require('../middlewares/auth');
const oauth = require('../controllers/oauth.controller');

const router = express.Router();
router.post('/register', oauth.register);
router.get('/authorize', oauth.authorize);
router.post('/approve', auth, oauth.approve);
router.post('/token', oauth.token);
module.exports = router;
