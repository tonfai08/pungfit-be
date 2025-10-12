const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const {
  createGroup,
  getMyGroups,
  addMember,
  joinByCode,
  getGroupDetail
} = require('../controllers/group.controller');

router.post('/', auth, createGroup);      
router.get('/my', auth, getMyGroups);       
router.post('/:groupId/members', auth, addMember);
router.post('/join', auth, joinByCode);
router.get('/:groupId', auth, getGroupDetail); 

module.exports = router;
