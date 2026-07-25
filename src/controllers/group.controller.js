const Group = require('../models/group.model');
const User = require('../models/user.model');

function generateJoinCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
// ✅ สร้างกลุ่มใหม่
exports.createGroup = async (req, res) => {
  try {
    const { name, members = [] } = req.body;
    const creatorId = req.user.id;

    // ✅ สร้าง join code ไม่ซ้ำ
    let join_code;
    let isUnique = false;

    while (!isUnique) {
      join_code = generateJoinCode();
      const existing = await Group.findOne({ join_code });
      if (!existing) isUnique = true;
    }

    const group = await Group.create({
      name,
      creator: creatorId,
      members: [creatorId, ...members],
      join_code,
    });

    res.status(201).json(group);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create group', error: err.message });
  }
};


// ✅ ดึงรายชื่อกลุ่มของผู้ใช้
exports.getMyGroups = async (req, res) => {
  try {
    const userId = req.user.id;

    const groups = await Group.find({
      members: { $in: [userId] },
    })
      .populate('creator', 'display_name email')
      .populate('members', 'display_name email');

    res.json(groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch groups', error: err.message });
  }
};

// ✅ เพิ่มสมาชิกเข้าในกลุ่ม
exports.addMember = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;

    const group = await Group.findByIdAndUpdate(
      groupId,
      { $addToSet: { members: userId } }, // กันซ้ำ
      { new: true }
    ).populate('members', 'display_name email');

    res.json(group);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to add member', error: err.message });
  }
};
exports.joinByCode = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    const group = await Group.findOneAndUpdate(
      { join_code: code },
      { $addToSet: { members: userId } }, // กันซ้ำ
      { new: true }
    ).populate('members', 'display_name email');

    if (!group) {
      return res.status(404).json({ message: 'Invalid join code' });
    }

    res.json(group);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to join group', error: err.message });
  }
};

exports.getGroupDetail = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    // 1️⃣ หา group พร้อม populate เพิ่ม profile_image และ last_login
    const group = await Group.findById(groupId)
      .populate('members', 'display_name profile_image last_login');

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // 2️⃣ ตรวจสอบว่า user อยู่ใน group ไหม
    const isMember = group.members.some((m) => m._id.toString() === userId);
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    // 3️⃣ ส่งเฉพาะข้อมูลที่ต้องการ (ไม่รวม height_cm / weight_kg)
    const memberData = group.members.map((m) => ({
      id: m._id,
      name: m.display_name || 'Unknown',
      profile_image: m.profile_image || null,
      last_login: m.last_login || null,
    }));

    res.json({
      _id: group._id,
      name: group.name,
      creator: group.creator,
      members: memberData,
      join_code: group.join_code,
      createdAt: group.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Failed to fetch group detail',
      error: err.message,
    });
  }
};
