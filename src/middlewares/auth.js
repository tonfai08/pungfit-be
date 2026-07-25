const { verify } = require('../utils/jwt');

module.exports = (req, res, next) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = verify(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role || 'user' };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
