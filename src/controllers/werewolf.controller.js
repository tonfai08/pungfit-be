const mongoose = require('mongoose');
const WerewolfRole = require('../models/werewolf-role.model');
const WerewolfRoom = require('../models/werewolf-room.model');

function generateJoinCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getExpectedRoleTotal(maxPlayers) {
  return Math.max(Number(maxPlayers) - 1, 0);
}

function shuffleArray(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function normalizePlayerCode(code) {
  if (typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

function normalizeDisplayName(name) {
  if (typeof name !== 'string') return '';
  return name.trim();
}

function getRequesterCode(req) {
  return normalizePlayerCode(
    req.headers['x-player-code'] || req.body?.player_code || req.query?.player_code
  );
}

function getRequesterName(req) {
  return normalizeDisplayName(
    req.headers['x-player-name'] || req.body?.display_name || req.query?.display_name
  );
}

function getRoomCode(req) {
  return typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
}

function findPlayerByCode(room, playerCode) {
  return room.players.find((player) => normalizePlayerCode(player.player_code) === playerCode);
}

async function validateRoleSlots(roleSlots, expectedTotal) {
  if (!Array.isArray(roleSlots) || roleSlots.length === 0) {
    return { ok: false, message: 'role_slots must be a non-empty array' };
  }

  const roleIdMap = new Map();
  let total = 0;

  for (const slot of roleSlots) {
    const roleId = slot?.roleId || slot?.role;
    const count = Number(slot?.count);

    if (!mongoose.Types.ObjectId.isValid(roleId)) {
      return { ok: false, message: 'Each role slot must have a valid roleId' };
    }
    if (!Number.isInteger(count) || count < 1) {
      return { ok: false, message: 'Each role slot count must be integer >= 1' };
    }

    const key = roleId.toString();
    if (roleIdMap.has(key)) {
      return { ok: false, message: 'Duplicate roleId in role_slots' };
    }

    roleIdMap.set(key, { role: roleId, count });
    total += count;
  }

  if (total !== expectedTotal) {
    return {
      ok: false,
      message: `Total role count (${total}) must equal non-mod players (${expectedTotal})`,
    };
  }

  const roleIds = [...roleIdMap.keys()];
  const foundRoles = await WerewolfRole.find({ _id: { $in: roleIds } }).select('_id');
  if (foundRoles.length !== roleIds.length) {
    return { ok: false, message: 'Some roles in role_slots do not exist' };
  }

  return {
    ok: true,
    normalized: [...roleIdMap.values()].map((s) => ({ role: s.role, count: s.count })),
  };
}

exports.createRole = async (req, res) => {
  try {
    const { code, name, team = 'villager', description = '' } = req.body;
    if (!code || !name) {
      return res.status(400).json({ message: 'code and name are required' });
    }

    const role = await WerewolfRole.create({ code, name, team, description });
    return res.status(201).json(role);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Role code already exists' });
    }
    console.error(err);
    return res.status(500).json({ message: 'Failed to create role', error: err.message });
  }
};

exports.getRoles = async (req, res) => {
  try {
    const roles = await WerewolfRole.find().sort({ createdAt: 1 });
    return res.json(roles);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to fetch roles', error: err.message });
  }
};

exports.createRoom = async (req, res) => {
  try {
    const { name, max_players = 8, role_slots = [] } = req.body;
    const creatorCode = getRequesterCode(req);
    const creatorName = getRequesterName(req);

    if (!name) {
      return res.status(400).json({ message: 'name is required' });
    }
    if (!creatorCode) {
      return res.status(400).json({ message: 'player_code is required' });
    }
    if (!creatorName) {
      return res.status(400).json({ message: 'display_name is required' });
    }

    const maxPlayers = Number(max_players);
    if (!Number.isInteger(maxPlayers) || maxPlayers < 1) {
      return res.status(400).json({ message: 'max_players must be integer >= 1' });
    }

    let normalizedRoleSlots = [];
    if (role_slots.length > 0) {
      const roleSlotValidation = await validateRoleSlots(role_slots, getExpectedRoleTotal(maxPlayers));
      if (!roleSlotValidation.ok) {
        return res.status(400).json({ message: roleSlotValidation.message });
      }
      normalizedRoleSlots = roleSlotValidation.normalized;
    }

    let join_code;
    let isUnique = false;
    while (!isUnique) {
      join_code = generateJoinCode();
      const existing = await WerewolfRoom.findOne({ join_code });
      if (!existing) isUnique = true;
    }

    const room = await WerewolfRoom.create({
      name,
      creator_code: creatorCode,
      creator_name: creatorName,
      join_code,
      max_players: maxPlayers,
      role_slots: normalizedRoleSlots,
      players: [
        {
          player_code: creatorCode,
          display_name: creatorName,
        },
      ],
    });

    return res.status(201).json(room);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to create room', error: err.message });
  }
};

exports.updateRoomConfig = async (req, res) => {
  try {
    const { roomId } = req.params;
    const requesterCode = getRequesterCode(req);
    const { max_players, role_slots } = req.body;

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid roomId' });
    }
    if (!requesterCode) {
      return res.status(400).json({ message: 'player_code is required' });
    }

    const room = await WerewolfRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (normalizePlayerCode(room.creator_code) !== requesterCode) {
      return res.status(403).json({ message: 'Only room creator can update config' });
    }

    const hasMaxPlayers = max_players !== undefined;
    const hasRoleSlots = role_slots !== undefined;
    if (!hasMaxPlayers && !hasRoleSlots) {
      return res.status(400).json({ message: 'Provide max_players and/or role_slots' });
    }

    const nextMaxPlayers = hasMaxPlayers ? Number(max_players) : room.max_players;
    if (!Number.isInteger(nextMaxPlayers) || nextMaxPlayers < 1) {
      return res.status(400).json({ message: 'max_players must be integer >= 1' });
    }
    if (room.players.length > nextMaxPlayers) {
      return res.status(400).json({ message: 'max_players cannot be less than current players' });
    }

    let nextRoleSlots = room.role_slots;
    if (hasRoleSlots) {
      const roleSlotValidation = await validateRoleSlots(
        role_slots,
        getExpectedRoleTotal(nextMaxPlayers)
      );
      if (!roleSlotValidation.ok) {
        return res.status(400).json({ message: roleSlotValidation.message });
      }
      nextRoleSlots = roleSlotValidation.normalized;
    } else if (room.role_slots.length > 0) {
      const currentTotal = room.role_slots.reduce((sum, slot) => sum + slot.count, 0);
      const expectedRoleTotal = getExpectedRoleTotal(nextMaxPlayers);
      if (currentTotal !== expectedRoleTotal) {
        return res.status(400).json({
          message: 'When changing max_players, please update role_slots so total matches non-mod players',
        });
      }
    }

    room.max_players = nextMaxPlayers;
    room.role_slots = nextRoleSlots;
    await room.save();

    return res.json({ message: 'Room config updated', room });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to update room config', error: err.message });
  }
};

exports.joinRoomById = async (req, res) => {
  try {
    const { roomId } = req.params;
    const playerCode = getRequesterCode(req);
    const displayName = getRequesterName(req);

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid roomId' });
    }
    if (!playerCode) {
      return res.status(400).json({ message: 'player_code is required' });
    }
    if (!displayName) {
      return res.status(400).json({ message: 'display_name is required' });
    }

    const room = await WerewolfRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const player = findPlayerByCode(room, playerCode);
    if (!player) {
      if (room.players.length >= room.max_players) {
        return res.status(400).json({ message: 'Room is full' });
      }
      room.players.push({ player_code: playerCode, display_name: displayName });
      await room.save();
    } else if (displayName && player.display_name !== displayName) {
      player.display_name = displayName;
      await room.save();
    }

    return res.json({
      message: 'Joined room',
      room_id: room._id,
      join_code: room.join_code,
      player_code: playerCode,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to join room', error: err.message });
  }
};

exports.joinRoomByCode = async (req, res) => {
  try {
    const code = getRoomCode(req);
    const playerCode = getRequesterCode(req);
    const displayName = getRequesterName(req);

    if (!code) return res.status(400).json({ message: 'code is required' });
    if (!playerCode) {
      return res.status(400).json({ message: 'player_code is required' });
    }
    if (!displayName) {
      return res.status(400).json({ message: 'display_name is required' });
    }

    const room = await WerewolfRoom.findOne({ join_code: code });
    if (!room) return res.status(404).json({ message: 'Invalid join code' });

    const player = findPlayerByCode(room, playerCode);
    if (!player) {
      if (room.players.length >= room.max_players) {
        return res.status(400).json({ message: 'Room is full' });
      }
      room.players.push({ player_code: playerCode, display_name: displayName });
      await room.save();
    } else if (displayName && player.display_name !== displayName) {
      player.display_name = displayName;
      await room.save();
    }

    return res.json({
      message: 'Joined room',
      room_id: room._id,
      join_code: room.join_code,
      player_code: playerCode,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to join room', error: err.message });
  }
};

exports.assignRoleToPlayer = async (req, res) => {
  try {
    const { roomId } = req.params;
    const requesterCode = getRequesterCode(req);
    const targetPlayerCode = normalizePlayerCode(req.body?.target_player_code);
    const { roleId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid roomId' });
    }
    if (!requesterCode) {
      return res.status(400).json({ message: 'player_code is required' });
    }
    if (!targetPlayerCode || !mongoose.Types.ObjectId.isValid(roleId)) {
      return res.status(400).json({ message: 'Invalid target_player_code or roleId' });
    }

    const room = await WerewolfRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (normalizePlayerCode(room.creator_code) !== requesterCode) {
      return res.status(403).json({ message: 'Only room creator can assign roles' });
    }

    if (normalizePlayerCode(room.creator_code) === targetPlayerCode) {
      return res.status(400).json({ message: 'mod role is reserved for room creator' });
    }

    const role = await WerewolfRole.findById(roleId);
    if (!role) return res.status(404).json({ message: 'Role not found' });

    const player = findPlayerByCode(room, targetPlayerCode);
    if (!player) return res.status(404).json({ message: 'Player is not in this room' });

    if (room.role_slots.length > 0) {
      const slot = room.role_slots.find((s) => s.role.toString() === roleId);
      if (!slot) {
        return res.status(400).json({ message: 'This role is not allowed in this room config' });
      }

      const currentAssigned = room.players.filter(
        (p) => p.role && p.role.toString() === roleId
      ).length;

      const isSameRole = player.role && player.role.toString() === roleId;
      if (!isSameRole && currentAssigned >= slot.count) {
        return res.status(400).json({
          message: `Role quota reached for ${role.name} (max ${slot.count})`,
        });
      }
    }

    player.role = role._id;
    player.role_code = role.code;
    player.role_name = role.name;
    await room.save();

    return res.json({ message: 'Role assigned successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to assign role', error: err.message });
  }
};

exports.assignRandomRoles = async (req, res) => {
  try {
    const { roomId } = req.params;
    const requesterCode = getRequesterCode(req);

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid roomId' });
    }
    if (!requesterCode) {
      return res.status(400).json({ message: 'player_code is required' });
    }

    const room = await WerewolfRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    if (normalizePlayerCode(room.creator_code) !== requesterCode) {
      return res.status(403).json({ message: 'Only room creator can randomize roles' });
    }
    if (room.status !== 'waiting') {
      return res.status(400).json({ message: 'Roles can only be randomized when room is waiting' });
    }
    if (room.players.length !== room.max_players) {
      return res.status(400).json({
        message: 'Room is not ready yet. Wait until all players have joined',
      });
    }
    if (room.role_slots.length === 0) {
      return res.status(400).json({ message: 'role_slots is required before randomizing roles' });
    }

    const creatorCode = normalizePlayerCode(room.creator_code);
    const nonModPlayers = room.players.filter(
      (player) => normalizePlayerCode(player.player_code) !== creatorCode
    );
    const expectedRoleTotal = nonModPlayers.length;
    const configuredTotal = room.role_slots.reduce((sum, slot) => sum + slot.count, 0);
    if (configuredTotal !== expectedRoleTotal) {
      return res.status(400).json({
        message: `Total configured roles (${configuredTotal}) must equal non-mod players (${expectedRoleTotal})`,
      });
    }

    const rolePool = [];
    room.role_slots.forEach((slot) => {
      for (let i = 0; i < slot.count; i++) {
        rolePool.push(slot.role.toString());
      }
    });
    shuffleArray(rolePool);

    const roleIds = [...new Set(rolePool)];
    const roleDocs = await WerewolfRole.find({ _id: { $in: roleIds } }).select('code name');
    const roleMap = new Map(roleDocs.map((role) => [role._id.toString(), role]));

    nonModPlayers.forEach((player, index) => {
      const roleId = rolePool[index];
      const role = roleMap.get(roleId);
      player.role = roleId;
      player.role_code = role?.code || null;
      player.role_name = role?.name || null;
    });

    const creatorPlayer = findPlayerByCode(room, creatorCode);
    if (creatorPlayer) {
      creatorPlayer.role = null;
      creatorPlayer.role_code = 'mod';
      creatorPlayer.role_name = 'Moderator';
    }

    room.status = 'started';
    await room.save();

    return res.json({
      message: 'Random roles assigned successfully',
      room_id: room._id,
      status: room.status,
      assigned_players: nonModPlayers.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to randomize roles', error: err.message });
  }
};

exports.getMyRole = async (req, res) => {
  try {
    const { roomId } = req.params;
    const requesterCode = getRequesterCode(req);

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid roomId' });
    }
    if (!requesterCode) {
      return res.status(400).json({ message: 'player_code is required' });
    }

    const room = await WerewolfRoom.findById(roomId).populate(
      'players.role',
      'code name team description'
    );
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const me = findPlayerByCode(room, requesterCode);
    if (!me) {
      return res.status(403).json({ message: 'You are not in this room' });
    }

    const isMod = normalizePlayerCode(room.creator_code) === requesterCode;
    return res.json({
      room_id: room._id,
      room_status: room.status,
      is_mod: isMod,
      player_code: me.player_code,
      display_name: me.display_name,
      role: me.role
        ? {
            id: me.role._id,
            code: me.role.code,
            name: me.role.name,
            team: me.role.team,
            description: me.role.description,
          }
        : me.role_code || me.role_name
          ? {
              id: null,
              code: me.role_code,
              name: me.role_name,
              team: null,
              description: null,
            }
          : null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to fetch my role', error: err.message });
  }
};

exports.getRoomRoleTable = async (req, res) => {
  try {
    const { roomId } = req.params;
    const requesterCode = getRequesterCode(req);

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid roomId' });
    }
    if (!requesterCode) {
      return res.status(400).json({ message: 'player_code is required' });
    }

    const room = await WerewolfRoom.findById(roomId)
      .populate('role_slots.role', 'code name team')
      .populate('players.role', 'code name team');

    if (!room) return res.status(404).json({ message: 'Room not found' });

    const me = findPlayerByCode(room, requesterCode);
    if (!me) {
      return res.status(403).json({ message: 'You are not in this room' });
    }

    const creatorCode = normalizePlayerCode(room.creator_code);
    const isMod = creatorCode === requesterCode;
    const table = room.players.map((player) => {
      const playerCode = normalizePlayerCode(player.player_code);
      const isSelf = playerCode === requesterCode;
      const canViewRole = isMod || isSelf;

      return {
        player_code: player.player_code,
        display_name: player.display_name,
        role_id: canViewRole ? player.role?._id || null : null,
        role_code: canViewRole ? player.role?.code || player.role_code || null : null,
        role_name: canViewRole ? player.role?.name || player.role_name || null : null,
        team: canViewRole ? player.role?.team || null : null,
        joined_at: player.joined_at,
      };
    });

    const role_config = room.role_slots.map((slot) => ({
      role_id: slot.role?._id || slot.role,
      role_code: slot.role?.code || null,
      role_name: slot.role?.name || null,
      team: slot.role?.team || null,
      count: slot.count,
    }));

    return res.json({
      room: {
        id: room._id,
        name: room.name,
        status: room.status,
        join_code: room.join_code,
        max_players: room.max_players,
        creator_code: room.creator_code,
        creator_name: room.creator_name,
        requester_is_mod: isMod,
        current_players: room.players.length,
        role_config,
      },
      table,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to fetch room table', error: err.message });
  }
};

exports.finishRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const requesterCode = getRequesterCode(req);

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid roomId' });
    }
    if (!requesterCode) {
      return res.status(400).json({ message: 'player_code is required' });
    }

    const room = await WerewolfRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: 'Room not found' });

    if (normalizePlayerCode(room.creator_code) !== requesterCode) {
      return res.status(403).json({ message: 'Only room creator can finish room' });
    }

    room.status = 'finished';
    await room.save();

    return res.json({
      message: 'Room finished successfully',
      room_id: room._id,
      status: room.status,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Failed to finish room', error: err.message });
  }
};
