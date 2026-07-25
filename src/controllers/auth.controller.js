const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/user.model');
const { sign } = require('../utils/jwt');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function buildAuthResponse(user, token) {
  return {
    token,
    user: {
      id: user._id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      height_cm: user.height_cm,
      weight_kg: user.weight_kg,
      body_fat_percent: user.body_fat_percent,
      gender: user.gender,
      age: user.age,
      activity_level: user.activity_level,
      bmr: user.bmr,
      tdee: user.tdee,
      profile_image: user.profile_image,
      last_login: user.last_login
    }
  };
}

exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password, display_name } = req.body;

  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ error: 'Email already in use' });

  const password_hash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, password_hash, display_name });

  const token = sign({ sub: user._id.toString(), email: user.email, role: user.role });
  return res.status(201).json({
    token,
    user: { id: user._id, email: user.email, display_name: user.display_name, role: user.role }
  });
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  // ✅ อัปเดตเวลาล็อกอินล่าสุด
  user.last_login = new Date();
  await user.save();

  const token = sign({ sub: user._id.toString(), email: user.email, role: user.role });

  return res.json(buildAuthResponse(user, token));
};

exports.google = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { id_token } = req.body;

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid Google token' });
  }

  const { sub: google_id, email, name } = payload;
  if (!email) return res.status(400).json({ error: 'Google account has no email' });

  let user = await User.findOne({ google_id });
  if (!user) {
    user = await User.findOne({ email });
    if (user) {
      user.google_id = google_id;
    } else {
      user = new User({ email, google_id, display_name: name });
    }
  }

  user.last_login = new Date();
  await user.save();

  const token = sign({ sub: user._id.toString(), email: user.email, role: user.role });

  return res.json(buildAuthResponse(user, token));
};

exports.me = async (req, res) => {
  const user = await User.findById(req.user.id).select('_id email display_name role');
  res.json({ user });
};
