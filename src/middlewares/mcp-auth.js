const crypto = require('crypto');
const User = require('../models/user.model');
const { verify } = require('../utils/jwt');

module.exports = async (req, res, next) => {
  const endpoint = req.baseUrl === '/mcp-v2' ? '/mcp-v2' : '/mcp';
  const expectedResource = `${process.env.PUBLIC_API_ORIGIN || 'https://api.pungfit.life'}${endpoint}`;
  const metadata = `${process.env.PUBLIC_API_ORIGIN || 'https://api.pungfit.life'}/.well-known/oauth-protected-resource${endpoint}`;
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : null;

  if (!token) {
    res.set('WWW-Authenticate', `Bearer resource_metadata="${metadata}"`);
    return res.status(401).json({ error: 'MCP bearer token is required' });
  }

  try {
    if (!token.startsWith('pungfit_pat_')) {
      const payload = verify(token);
      if (payload.token_use !== 'mcp' || payload.resource !== expectedResource) {
        return res.status(403).json({ error: 'A dedicated MCP token is required' });
      }
      req.user = { id: payload.sub, email: payload.email, role: payload.role || 'user', scopes: payload.scopes || [] };
      return next();
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({ mcp_access_key_hash: tokenHash });
    if (!user) return res.status(401).json({ error: 'Invalid or revoked MCP access key' });

    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role || 'user',
      scopes: ['workout:read', 'workout:write', 'meal:read', 'meal:write'],
    };
    return next();
  } catch (error) {
    res.set('WWW-Authenticate', `Bearer resource_metadata="${metadata}"`);
    return res.status(401).json({ error: 'Invalid MCP access token' });
  }
};
