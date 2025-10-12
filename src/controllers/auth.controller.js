const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const User = require('../models/user.model');
const { sign } = require('../utils/jwt');

exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password, display_name } = req.body;

  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ error: 'Email already in use' });

  const password_hash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, password_hash, display_name });

  const token = sign({ sub: user._id.toString(), email: user.email });
  return res.status(201).json({
    token,
    user: { id: user._id, email: user.email, display_name: user.display_name }
  });
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = sign({ sub: user._id.toString(), email: user.email });

  return res.json({
    token,
    user: {
      id: user._id,
      email: user.email,
      display_name: user.display_name,
      height_cm: user.height_cm,
      weight_kg: user.weight_kg,
      body_fat_percent: user.body_fat_percent,
      gender: user.gender,
      age: user.age
    }
  });
};


exports.me = async (req, res) => {
  const user = await User.findById(req.user.id).select('_id email display_name');
  res.json({ user });
};
