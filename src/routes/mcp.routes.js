const express = require('express');
const mcpAuth = require('../middlewares/mcp-auth');
const { handleMcpRequest } = require('../mcp/server');

const router = express.Router();

router.post('/', mcpAuth, handleMcpRequest);
router.get('/', (req, res) => {
  res.status(405).json({ error: 'Use POST for MCP requests' });
});
router.delete('/', (req, res) => {
  res.status(405).json({ error: 'Stateless MCP endpoint does not use DELETE' });
});

module.exports = router;
