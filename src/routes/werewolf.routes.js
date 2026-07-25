const express = require('express');
const {
  createRole,
  getRoles,
  createRoom,
  updateRoomConfig,
  joinRoomById,
  joinRoomByCode,
  assignRoleToPlayer,
  assignRandomRoles,
  getRoomRoleTable,
  getMyRole,
  finishRoom,
} = require('../controllers/werewolf.controller');

const router = express.Router();

router.post('/roles', createRole);
router.get('/roles', getRoles);

router.post('/rooms', createRoom);
router.patch('/rooms/:roomId/config', updateRoomConfig);
router.post('/rooms/join', joinRoomByCode);
router.post('/rooms/:roomId/join', joinRoomById);
router.patch('/rooms/:roomId/assign-role', assignRoleToPlayer);
router.patch('/rooms/:roomId/assign-random-roles', assignRandomRoles);
router.get('/rooms/:roomId/my-role', getMyRole);
router.get('/rooms/:roomId/table', getRoomRoleTable);
router.patch('/rooms/:roomId/finish', finishRoom);

module.exports = router;
