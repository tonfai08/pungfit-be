const crypto = require('crypto');
const User = require('../models/user.model');

module.exports = async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : null;

  if (!token) {
    return res.status(401).json({ error: 'MCP bearer token is required' });
  }

  try {
    if (!token.startsWith('pungfit_pat_')) {
      return res.status(403).json({ error: 'A dedicated MCP access key is required' });
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({ mcp_access_key_hash: tokenHash });
    if (!user) return res.status(401).json({ error: 'Invalid or revoked MCP access key' });

    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role || 'user',
      scopes: ['workout:read', 'workout:write'],
    };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid MCP access key' });
  }
};
