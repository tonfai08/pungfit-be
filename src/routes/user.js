const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const { updateUser,getMe } = require('../controllers/user.controller');

router.put('/me', auth, updateUser);
router.get('/me', auth, getMe);


module.exports = router;
