const crypto = require('crypto');
const User = require('../models/user.model');

exports.createMcpAccessKey = async (req, res) => {
  try {
    const accessKey = `pungfit_pat_${crypto.randomBytes(32).toString('base64url')}`;
    const accessKeyHash = crypto.createHash('sha256').update(accessKey).digest('hex');
    const user = await User.findById(req.user.id).select('+mcp_access_key_hash');
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.mcp_access_key_hash = accessKeyHash;
    await user.save();

    return res.json({
      success: true,
      access_key: accessKey,
      token_type: 'Bearer',
      scopes: ['workout:read', 'workout:write', 'meal:read', 'meal:write'],
      message: 'Access key created. Copy it now; it will not be shown again.',
    });
  } catch (error) {
    console.error('Error creating MCP access key:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

exports.disableMcpAccess = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+mcp_access_key_hash');
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.mcp_access_key_hash = undefined;
    await user.save();

    return res.json({ success: true, message: 'MCP access disabled' });
  } catch (error) {
    console.error('Error disabling MCP access:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
